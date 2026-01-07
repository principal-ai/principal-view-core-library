# Log Flow & Mutation Concept

## What the Canvas Represents

The canvas is a **static map** of your system architecture:
- Services (API Gateway, Auth Service, Order Service)
- Databases (PostgreSQL, Redis)
- Message queues (Kafka, RabbitMQ)
- Any component in your distributed system

Think of it like a city map - it shows the buildings and roads, but not the traffic.

## What Logs Represent

Logs are the **dynamic traffic** flowing through this map:
- HTTP requests moving through your services
- Database queries being executed
- Events being published to queues
- Any runtime activity

## The Key Insight: Log Enrichment at Service Boundaries

Each **layer** represents a **service boundary** where the log should be enriched with new context. This is the "wide event" pattern:

### Example: E-commerce Order Request

**Initial Request (HTTP)**
```
POST /orders
Headers: { Authorization: "Bearer xyz..." }
Body: { items: [...], total: 149.99 }
```

**Layer 1: API Gateway (Ingress)**
```json
{
  "timestamp": "2026-01-06T23:00:00Z",
  "severity": "INFO",
  "service.name": "api-gateway",

  // Context added by this layer:
  "request_id": "req-12345",        // Generated here
  "method": "POST",
  "path": "/orders",
  "client_ip": "192.168.1.100"
}
```

**Layer 2: Auth Service**
```json
{
  "timestamp": "2026-01-06T23:00:01Z",
  "severity": "INFO",
  "service.name": "auth-service",

  // Preserved from previous layer:
  "request_id": "req-12345",

  // Context added by this layer:
  "user_id": "user-456",             // Extracted from token
  "user_tier": "premium",            // Looked up in DB
  "user_lifetime_value": 2499.99,   // Business context!
  "auth_duration_ms": 45
}
```

**Layer 3: Order Service**
```json
{
  "timestamp": "2026-01-06T23:00:02Z",
  "severity": "INFO",
  "service.name": "order-service",

  // Preserved from previous layers:
  "request_id": "req-12345",
  "user_id": "user-456",
  "user_tier": "premium",

  // Context added by this layer:
  "order_id": "ord-789",             // Generated here
  "cart_value": 149.99,              // Business context!
  "item_count": 3,                   // Business context!
  "processing_time_ms": 234,
  "inventory_check_ms": 180
}
```

**Layer 4: Database**
```json
{
  "timestamp": "2026-01-06T23:00:03Z",
  "severity": "INFO",
  "service.name": "postgres",

  // Preserved from previous layers:
  "request_id": "req-12345",
  "user_id": "user-456",
  "order_id": "ord-789",

  // Context added by this layer:
  "query_duration_ms": 12,
  "rows_affected": 3,
  "table": "orders"
}
```

## The Power of This Pattern

Now when something goes wrong, you can search for:
```
request_id:"req-12345"
```

And you get **one log per service** with **all the context** needed to debug:
- Who made the request? (user_id, user_tier)
- What were they trying to do? (order_id, cart_value)
- How long did each step take? (auth_duration_ms, processing_time_ms, query_duration_ms)
- Did anything fail? (Check severity per service)

No more searching through 50 scattered log lines trying to piece together what happened!

## How the Visualization Shows This

### Static View (Canvas)
- Shows the architecture (which services exist)
- Shows the flow (arrows between services)
- Organized by layers (service boundaries)

### Runtime View (Log Flow)
When connected to live OTEL data:

1. **Particle animations** on edges = requests flowing
2. **Node pulsing** = service is processing a request
3. **Edge tooltips** = what data is in the log at that point
4. **Node tooltips/panel** = what fields this service adds to logs

### Narrative Mode (Request Journey)
Click a request_id to:
1. Highlight the path it took through services
2. Show the log at each layer
3. Highlight which fields were added where
4. Make it obvious if context is missing

## Example Use Cases

### Debugging a Failed Order
1. Search logs for `order_id:"ord-789"`
2. Click "Show in visualization"
3. See the request path highlighted
4. See the log at each service:
   - ✅ API Gateway: Request received
   - ✅ Auth: User authenticated (premium tier)
   - ✅ Order Service: Order created
   - ❌ Payment Service: **Card declined** (you found it!)

### Analyzing Performance
1. Search for `user_tier:"premium" AND processing_time_ms > 500`
2. See which services are slow for premium users
3. Visualization shows bottlenecks (thick nodes = high latency)

### Improving Telemetry
1. Load your canvas showing desired architecture
2. See which nodes have **sparse logs** (missing fields)
3. Add the missing fields to emit comprehensive events
4. Validate by seeing logs flow through with full context

## Implementation Notes

### Canvas Structure
- **Nodes** = Services (with dataSchema showing what fields they add)
- **Edges** = Request flow
- **Layers** = Service boundaries (where events are emitted)

### Live Integration
When consuming OTEL logs:
1. Route log to correct node based on `service.name`
2. Animate the node (pulse)
3. Animate incoming edge (particle)
4. Show log context in tooltip/panel
5. Track which nodes are "silent" (not emitting logs)

### The "Narrative"
Each layer has a narrative field:
- **Ingress**: "Request arrives, assigned request_id"
- **Auth**: "User authenticated, context enriched with user info"
- **Business**: "Order created, context enriched with business data"
- **Data**: "Data persisted, query metrics recorded"

This helps developers understand **what should happen** at each boundary, guiding them to emit the right logs.

## Comparison to Traditional Logging

### Traditional (Bad)
```
[2026-01-06 23:00:00] INFO: Received request
[2026-01-06 23:00:01] DEBUG: Checking auth
[2026-01-06 23:00:01] DEBUG: Token valid
[2026-01-06 23:00:02] INFO: Creating order
[2026-01-06 23:00:02] DEBUG: Checking inventory
[2026-01-06 23:00:03] INFO: Order created
```

To answer "What happened to request X?":
- Search logs for timestamps around that time
- Manually correlate 6+ log lines
- Hope you included the user_id in one of them
- No business context (cart value, user tier, etc.)

### With Layers (Good)
```json
// One log per service, all with request_id
{"request_id":"req-12345", "service":"api-gateway", ...}
{"request_id":"req-12345", "service":"auth", "user_tier":"premium", ...}
{"request_id":"req-12345", "service":"order", "order_id":"ord-789", "cart_value":149.99, ...}
```

To answer "What happened to request X?":
- Search for `request_id:"req-12345"`
- Get 3-5 comprehensive logs (one per service)
- Full context included (who, what, how long, business data)
- Click to visualize the path

## Next Steps

1. **Create your canvas** - Map your services to layers
2. **Define dataSchema** - Document what each service should log
3. **Connect OTEL** - Route logs to nodes, animate the flow
4. **Enable narrative mode** - Click requests to see their journey
5. **Improve telemetry** - Fill gaps revealed by the visualization

The visualization becomes both **documentation** and **runtime observability** for your distributed system.
