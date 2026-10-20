# Messaging: Kafka and RabbitMQ

Covers: Kafka vs RabbitMQ, delivery semantics, idempotent consumers, ordering, backpressure, DLQ, why this project uses both.

## The problem it solves
Synchronous calls couple a producer to the speed and availability of its consumer. A broker **decouples** them in time and rate: absorb bursts, survive consumer downtime, fan out to many consumers, and retry failures without the caller waiting.

## Mental model

```
KAFKA = a durable, partitioned LOG; consumers PULL and track their own offset
  producer -> [ P0: e0 e1 e2 e3 ... ]  <- consumer group A (offset 3)
              [ P1: e0 e1 e2 ...    ]  <- consumer group B (offset 1)   (independent reads, replayable)
  one partition -> at most ONE consumer per group (ordering + parallelism = partition count)

RABBITMQ = a ROUTER + QUEUES; broker PUSHES messages, consumer ACKs, message is then deleted
  producer -> exchange --(binding / routing key)--> queue -> consumer
                                              └-> queue -> consumer
  failure -> nack / retry -> dead-letter exchange -> DLQ
```

| | Kafka | RabbitMQ |
|---|---|---|
| Core idea | append-only log | smart broker routing to queues |
| Consumption | pull; consumer owns offset | push; ack deletes message |
| Retention | by time/size; **replay** possible | until consumed (unless queue limits) |
| Ordering | per partition | per queue (breaks with competing consumers / requeue) |
| Scale-out | partitions + consumer groups | competing consumers on a queue |
| Routing | topic + key only | rich: direct, topic, fanout, headers exchanges |
| Per-message retry/DLQ/TTL/priority | build it yourself | built in |
| Sweet spot | high-throughput event streams, event history, replay | task queues, workflows, alerts, flexible routing |

## Trade-offs and when to choose what
- **Need replay, history, many independent readers, very high throughput?** Kafka.
- **Need per-message retry, routing, delays, DLQ, priorities, low-volume jobs?** RabbitMQ.
- **Need ordering?** Kafka: choose a key so related events share a partition. RabbitMQ: single consumer per queue, accept lower throughput.
- **Why both here?** The event stream is a *log* of facts that must be replayable and scale by partition (Kafka). Alerts are *work items* with retry/DLQ semantics and routing (RabbitMQ). Using one for both means re-implementing the other's strengths. Cost: two systems to operate; justified here because the project exists to learn both. In a real small team, pick one until pain proves otherwise.

## Failure modes and how to reason about them

**Delivery semantics:**

| Semantics | Meaning | How it happens | Risk |
|-----------|---------|----------------|------|
| At-most-once | never redelivered | commit offset / ack *before* processing | **lost** messages on crash |
| At-least-once | redelivered until acked | commit/ack *after* processing | **duplicates** on crash/rebalance |
| Exactly-once | effect applied once | at-least-once + idempotent consumer (or transactional read-process-write inside one system) | complexity; only true within a boundary |

Practical stance: **at-least-once delivery + idempotent processing = effectively-once.** End-to-end exactly-once across independent systems is not achievable by the broker alone.

Reasoning about a crash: "Where is the commit point? What was already side-effected? After restart, what gets redelivered?" Process then commit -> duplicates. Commit then process -> loss.

- **Duplicates:** idempotency key (`event_id`) + unique constraint (`ON CONFLICT DO NOTHING`), or conditional updates. Aggregates must change **only when the insert actually happened**, in the same transaction.
- **Rebalance:** when consumers join/leave, partitions are reassigned; uncommitted work is redone by another consumer. Keep processing idempotent and batches short enough to commit quickly.
- **Consumer lag growing:** producers outrun consumers. Check processing time per batch, DB write latency, partition skew (hot key), and consumer count (cannot exceed partitions). Scale consumers, batch more, speed up the sink, or shed load.
- **Hot partition:** a skewed key sends most traffic to one partition; adding partitions doesn't help that key.
- **Adding partitions later:** key -> partition mapping changes, so per-key order can break across the change; plan partition count up front.
- **Poison message:** always fails. Without bounded retries it blocks the partition (Kafka) or loops forever (Rabbit requeue). Fix: bounded retries with backoff, then DLQ; keep healthy traffic flowing.
- **Backpressure:** Kafka consumers pull at their own pace (natural backpressure, lag grows instead). RabbitMQ pushes, so bound in-flight messages with `prefetch`; unbounded queues just move the problem into memory/disk.
- **Broker down / message loss at the producer:** producer needs acks and retries; "commit to DB then publish" has a dual-write gap (solved by the outbox pattern, see [microservices](microservices.md)).

## Key details that matter
- **Consumer group guarantee:** each partition is consumed by exactly one member of the group at a time; different groups each get every message independently.
- **Offset commit** is the consumer's checkpoint; its position relative to side effects defines the semantics.
- Ordering is guaranteed **only within a partition**.
- Kafka producer settings that matter for durability: acks from all in-sync replicas, retries with idempotent producer to avoid duplicates from retries.
- RabbitMQ: **ack** after success, **nack** with or without requeue on failure; **prefetch** limits unacked messages per consumer; dead-lettering via DLX; retry-with-delay via TTL queue + DLX.
- Batch consumption: bigger batches raise throughput and latency; commit offsets after the batch is durably written.
- **Sync vs async ingest:** with a synchronous write the answer "accepted" means "stored"; with a queue in front it means only "accepted", and what happens between accepting and writing becomes your responsibility. In an async pipeline the consumer has no client to answer, so a duplicate is silently ignored (and ideally counted in a metric); a `200 duplicate` exists only in the synchronous design.
- Batches **inside** the system (a consumer reads many messages and writes one multi-row insert) are independent of batches **at the API** (a `POST /batch` endpoint that accepts an array). The first needs no new endpoint; the second only serves clients that buffer events.

## In 30 seconds
"Kafka is a partitioned, replayable log where consumers pull and track offsets; RabbitMQ is a routing broker that pushes messages to queues and deletes them on ack. I use Kafka for the high-volume event stream because I need ordering per key, parallelism by partition and replay, and RabbitMQ for alerts because I need routing, retries and a dead-letter queue. Delivery is at-least-once, so consumers must be idempotent: a unique event id with ON CONFLICT DO NOTHING turns duplicates into no-ops. If lag grows I check processing time and partition skew before adding consumers, since consumers can't exceed partitions. A queue in front of the database turns the answer from 'stored' into 'accepted', so I design for the gap between the two."

**Follow-ups:**
- *Can Kafka do exactly-once?* Within Kafka (idempotent producer + transactions); end-to-end with a DB sink needs an idempotent write or atomic offset+data storage.
- *How do you preserve order?* Same key -> same partition; one consumer per partition.
- *What happens on rebalance?* Partitions move; uncommitted messages are redelivered.
- *Why can't I add 100 consumers to fix lag?* Max useful consumers = partitions.
- *Message always fails?* Bounded retries with backoff, then DLQ plus alerting; investigate and replay.
- *Why not just Kafka for everything?* Per-message retry/delay/DLQ/routing aren't built in.
- *10,000 events/s hit a synchronous `POST` that inserts one row. What breaks first?* The connection pool (default 10 connections, requests queue and then time out) and the per-event commit overhead. Fixes: queue + batched writes (cost: weaker "accepted" guarantee, at-least-once delivery, more moving parts), batching in the app (cheaper, but events in memory are lost on a crash), more instances / pool size.
- *The consumer crashes after the DB commit but before the offset commit. What happens?* The batch is redelivered; the unique `event_id` plus `ON CONFLICT DO NOTHING` ignores the rows already stored, so the table holds each event once. If it crashed before the DB commit, the transaction rolled back and the redelivery inserts them.

## In Live Pulse
- Experiments: E4 (kill consumer), E5 (partitions), E6 (replay), E7 (lag), E8 (poison message/DLQ) in [EXPERIMENTS.md](../EXPERIMENTS.md).
- Stage 1 (#1, PR #3) ingests synchronously: `POST /events` writes to Postgres before answering. The idempotency design (client-generated `event_id`, unique constraint, `ON CONFLICT DO NOTHING`) is what will make an at-least-once Kafka consumer safe later.
- Issues / PRs: #1 / PR #3

## Lessons from building it
- **Quiz after #1:** the idempotent-consumer scenario was answered correctly (redelivered batch, conflicts ignored by the database). The gap was that in an async flow there is no client to reply `duplicate` to; it is ignored silently. Also: a batch consumer does not require a batch HTTP endpoint.
