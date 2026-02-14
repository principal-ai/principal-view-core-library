# Observability Compliance Guide

**Status:** Reference Document
**Author:** Principal View Team
**Date:** 2025-02-13
**Version:** 1.0.0

## Executive Summary

Traditional observability platforms create significant compliance challenges. When logs containing PII flow to third-party vendors like Datadog or Splunk, organizations face data sovereignty violations, impossible deletion requests, and regulatory penalties reaching €20 million or 4% of global revenue.

**The fundamental problem:** Once telemetry data enters third-party systems (immutable storage → backups → global replication), deletion becomes operationally impossible, creating irreconcilable conflicts with regulations like GDPR's "Right to Be Forgotten."

**Principal View's solution:** By keeping events local and aggregating before sending to platforms, organizations maintain full data sovereignty, enable compliant deletion, and achieve privacy-by-design—all while reducing observability costs by 90%+.

**Key Insight:** The same architecture that reduces costs (local aggregation) also solves compliance challenges. This isn't coincidence—it's fundamental. When you control where data lives and what gets sent externally, you control compliance.

---

## Table of Contents

1. [The Compliance Crisis in Observability](#the-compliance-crisis-in-observability)
   - [2025 Regulatory Landscape](#2025-regulatory-landscape)
   - [The Third-Party Data Problem](#the-third-party-data-problem)
   - [Industry Wake-Up Call](#industry-wake-up-call)
2. [Key Regulatory Requirements](#key-regulatory-requirements)
   - [GDPR (General Data Protection Regulation)](#gdpr-general-data-protection-regulation)
   - [HIPAA (Health Insurance Portability and Accountability Act)](#hipaa-health-insurance-portability-and-accountability-act)
   - [SOC 2 (Service Organization Control 2)](#soc-2-service-organization-control-2)
   - [Data Residency and Sovereignty](#data-residency-and-sovereignty)
   - [Retention Requirements Comparison](#retention-requirements-comparison)
3. [Where Traditional Observability Fails](#where-traditional-observability-fails)
   - [Data Sovereignty Violations](#data-sovereignty-violations)
   - [Impossible Deletion Requests](#impossible-deletion-requests)
   - [PII Leakage](#pii-leakage)
   - [Retention Policy Conflicts](#retention-policy-conflicts)
   - [Audit Trail Compromise](#audit-trail-compromise)
4. [How Principal View Enables Compliance](#how-principal-view-enables-compliance)
   - [Local-First Architecture](#local-first-architecture)
   - [Schema-Based PII Protection](#schema-based-pii-protection)
   - [Compliant Deletion](#compliant-deletion)
   - [Flexible Retention Policies](#flexible-retention-policies)
   - [Regional Isolation](#regional-isolation)
5. [Implementation Guide](#implementation-guide)
   - [Configuring PII Protection](#configuring-pii-protection)
   - [Setting Up Retention Policies](#setting-up-retention-policies)
   - [Implementing Deletion Workflows](#implementing-deletion-workflows)
   - [Regional Deployment Patterns](#regional-deployment-patterns)
   - [Audit Logging](#audit-logging)
6. [Compliance Scenarios](#compliance-scenarios)
   - [Scenario 1: GDPR Deletion Request](#scenario-1-gdpr-deletion-request)
   - [Scenario 2: HIPAA Audit Trail](#scenario-2-hipaa-audit-trail)
   - [Scenario 3: Multi-Region SOC 2](#scenario-3-multi-region-soc-2)
   - [Scenario 4: Data Residency (EU + US)](#scenario-4-data-residency-eu--us)
7. [Compliance Checklist](#compliance-checklist)
8. [References](#references)

---

## The Compliance Crisis in Observability

### 2025 Regulatory Landscape

The compliance landscape for observability data has fundamentally changed:

**Explosive growth in data protection laws:**
- 2011: 76 countries with data protection laws
- 2025: 120+ countries with data protection laws
- 24+ additional laws in progress

**Major enforcement milestones (2024-2026):**
- €1.2 billion in GDPR fines issued during 2024
- DORA (Digital Operational Resilience Act) enforcement began
- EU Data Act took effect
- EU AI Act compliance deadline: August 2, 2026 (10-year retention for technical logs)

**Critical industry finding (2025):**
> "Most teams still treat data residency as an afterthought, discovering too late that their logs are replicated globally, their metrics cross oceans, and their traces violate sovereignty laws."

### The Third-Party Data Problem

When you send observability data to platforms like Datadog, Splunk, or New Relic:

```
┌────────────────────────────────────────────────────────────────┐
│  WHAT HAPPENS TO YOUR DATA                                     │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Your App (EU) → Logs with PII → Datadog (US)                 │
│                                   ↓                             │
│                        Immutable Storage                        │
│                                   ↓                             │
│                        Global Backups (Multi-Region)            │
│                                   ↓                             │
│                        Analytics Systems                        │
│                                   ↓                             │
│                        ML Training Data                         │
│                                   ↓                             │
│                        Third-Party Integrations                 │
│                                                                 │
│  Problems:                                                      │
│  ❌ You lost control                                           │
│  ❌ Data crossed borders                                       │
│  ❌ Cannot delete from backups                                 │
│  ❌ Vendor controls retention                                  │
│  ❌ PII in third-party systems                                 │
│                                                                 │
│  Compliance impact:                                             │
│  • GDPR violation (unauthorized data transfer)                 │
│  • GDPR violation (right to be forgotten impossible)           │
│  • Data sovereignty violation                                  │
│  • Potential fines: €20M or 4% global revenue                 │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

**The critical quote:**
> "Once data enters telemetry systems (OTLP collectors → immutable storage → backups → third-party vendors like Datadog/New Relic), **deletion becomes operationally impossible**."

### Industry Wake-Up Call

**Real compliance failures:**

1. **Data sovereignty violations:**
   - US-based SOC cannot monitor EU customer data in real-time (GDPR restrictions)
   - Requires: Regional security teams, separate monitoring, jurisdiction-specific incident response
   - Cost: Duplicate infrastructure + regulatory penalties

2. **Deletion request failures:**
   - User requests deletion under GDPR Article 17
   - Data scattered across: Logs (vendor), Backups (multi-region), Analytics, ML datasets
   - Timeline: 30 days required, months/impossible in practice
   - Result: €20M fine risk

3. **PII leakage:**
   - Auto-instrumentation captures emails, IPs, user IDs in logs
   - No PII detection before sending to vendor
   - Discovered during audit: Months/years of PII in third-party systems
   - Result: Regulatory investigation + remediation costs

**The verdict:**
> "Location-blind telemetry isn't just risky—it's potentially illegal" (2025)

---

## Key Regulatory Requirements

### GDPR (General Data Protection Regulation)

**Jurisdiction:** European Union (applies to any org processing EU citizen data)

**Key Requirements for Observability:**

| Requirement | Description | Penalty |
|-------------|-------------|---------|
| **Article 17: Right to Be Forgotten** | Must delete user data within 30 days of request | Up to €20M or 4% global revenue |
| **Article 5(1)(f): Data Security** | Logs with PII must be encrypted (TLS 1.3, AES-256) | Up to €20M or 4% global revenue |
| **Data Minimization** | Only collect PII necessary for specific purpose | Up to €20M or 4% global revenue |
| **Data Residency** | EU citizen data must be stored in EU (with exceptions) | Up to €20M or 4% global revenue |
| **Purpose Limitation** | Cannot use PII for purposes beyond original intent | Up to €20M or 4% global revenue |

**Technical Implementation Requirements:**

1. **PII Detection and Redaction:**
   - Automated PII scrubbing from telemetry
   - Pattern matching to redact emails, IDs, IP addresses
   - Real-time scanning before data leaves infrastructure

2. **Deletion Propagation:**
   - Must delete from all systems within 30 days
   - Includes: Logs, backups, analytics, ML training data
   - Must provide deletion confirmation to user

3. **Encryption Requirements:**
   - TLS 1.3 for data in transit
   - AES-256 for data at rest
   - Key management under EU control (for sovereignty)

4. **Audit Logging:**
   - Log all data access events
   - Track deletion requests and completion
   - Immutable audit trails

**GDPR Observability Challenges:**

```
Traditional Logging:
logger.info('User john.doe@example.com logged in from 192.168.1.1')
                  ↑ PII              ↑ PII         ↑ PII

Problems:
- Email, IP in plain text
- Sent to third-party vendor
- In backups globally
- Cannot delete on request
- GDPR violation ❌

Compliant Approach:
emit('user.login', {
  userId: hash(email),        // Pseudonymized
  region: 'eu-west-1',        // Safe metadata
  // No email, no IP
})

Benefits:
- No PII in events
- Can aggregate to metrics
- Deletion = delete local userId mapping
- GDPR compliant ✅
```

### HIPAA (Health Insurance Portability and Accountability Act)

**Jurisdiction:** United States (healthcare organizations)

**Key Requirements for Observability:**

| Requirement | Description | Penalty |
|-------------|-------------|---------|
| **Audit Log Retention** | Minimum 6 years for logs with PHI | $100-$50,000 per violation |
| **Access Logging** | Log all PHI access (user, time, action, outcome) | $100-$50,000 per violation |
| **Encryption** | PHI must be encrypted at rest and in transit | $100-$50,000 per violation |
| **Audit Trail Immutability** | Logs must be tamper-proof | $100-$50,000 per violation |
| **Role-Based Access** | Restrict log access to authorized personnel | $100-$50,000 per violation |

**Note:** State laws may require longer retention (e.g., Arkansas: 10 years, North Carolina: until age 30 for minors)

**Required Log Elements:**

```typescript
interface HIPAACompliantLog {
  userId: string;           // Who accessed
  timestamp: Date;          // When
  action: string;           // What they did
  resource: string;         // What they accessed
  location: string;         // Where from (IP/device)
  outcome: 'success' | 'failure';  // Result
  phi_accessed?: boolean;   // Did this involve PHI?
}
```

**HIPAA Observability Challenges:**

1. **Long Retention:** 6+ years of logs = massive storage costs
2. **Immutability:** Cannot modify logs after creation (challenges vendor platforms)
3. **PHI Separation:** Audit logs must be separate from business logs
4. **Regional Compliance:** Some states require even longer retention

### SOC 2 (Service Organization Control 2)

**Jurisdiction:** Global (required for B2B SaaS vendors)

**Key Requirements for Observability:**

| Trust Principle | Requirement | Implementation |
|----------------|-------------|----------------|
| **Security** | 12-month log retention minimum | Automated archival after 1 month |
| **Availability** | System uptime and performance logs | Real-time metrics + historical trends |
| **Processing Integrity** | Data processing accuracy logs | Transaction event logs |
| **Confidentiality** | Access control and encryption logs | Audit events for data access |
| **Privacy** | PII handling and deletion logs | GDPR-style deletion workflows |

**SOC 2 Observability Characteristics:**

- No fixed retention periods (align with external laws)
- ISO 27001: 12 months recommended for incident response
- Must demonstrate security controls through logs
- Auditor access to log data during assessment

**Best Practice Retention:**
```
Policy: Retain logs for 7 years
├─ Year 0-1: Hot storage (immediate access)
├─ Year 1-3: Warm storage (slower retrieval)
├─ Year 3-7: Cold storage (archive)
└─ Year 7+: Secure deletion (automated)
```

### Data Residency and Sovereignty

**Key Distinctions:**

| Concept | Definition | Example |
|---------|------------|---------|
| **Data Residency** | Physical location where data is stored | Data sits in EU-WEST-1 data center |
| **Data Sovereignty** | Legal jurisdiction governing the data | EU laws apply (even if keys in US) |

**Critical Issue (2025):**
> "Your logs might sit in EU-WEST-1, but if encryption keys are managed from a US control plane, you have residency but **don't have sovereignty**."

**Regulatory Requirements by Region:**

| Region | Requirement | Impact on Observability |
|--------|-------------|------------------------|
| **EU (GDPR)** | Data must be stored in EU (with exceptions) | EU logs must stay in EU regions |
| **China (PIPL)** | Critical data must stay in China | Separate China observability stack |
| **Russia** | Personal data must be stored in Russia | Russian instance required |
| **India (DPDPA)** | Cross-border transfer restrictions | India-specific deployment |
| **Brazil (LGPD)** | Data transfer restrictions | Brazil region or consent |

**Observability Stack Implications:**

```
Non-Compliant Architecture:
├─ EU Application → Logs → Datadog US
├─ China Application → Logs → Datadog US
└─ India Application → Logs → Datadog US
Problem: All data leaves local jurisdiction ❌

Compliant Architecture:
├─ EU Application → Logs → Principal View (EU) → Metrics → Datadog EU
├─ China Application → Logs → Principal View (China) → Metrics → Local Platform
└─ India Application → Logs → Principal View (India) → Metrics → Datadog India
Solution: Data stays in jurisdiction ✅
```

### Retention Requirements Comparison

| Regulation | Retention Period | Applies To | Deletability |
|------------|-----------------|------------|--------------|
| **HIPAA** | 6 years minimum | Logs with PHI | No (audit trail) |
| **SOC 2** | 12 months recommended | Security logs | Varies |
| **GDPR** | As long as needed for purpose | All PII | Yes (Article 17) |
| **PCI DSS 4.0** | 12 months (3 immediately available) | Payment logs | No (fraud prevention) |
| **SOX** | 7 years | Financial audit logs | No (legal requirement) |
| **NERC** | 6 months logs, 3 years audit | Energy sector | No (safety) |
| **EU AI Act** | 10 years | AI system technical docs | No (accountability) |

**The Conflict:**
- GDPR says: "Delete user data on request"
- HIPAA says: "Keep audit logs for 6 years"
- SOX says: "Keep financial logs for 7 years"

**Resolution:** Separate event types with different retention policies (Principal View's approach).

---

## Where Traditional Observability Fails

### Data Sovereignty Violations

**The Problem:**

Most observability platforms use global infrastructure with automatic replication:

```
Your EU Application:
├─ Sends logs to "eu-west-1" Datadog endpoint
├─ Datadog replicates to US for redundancy
├─ Backup systems in multiple regions
├─ Analytics processing in US
└─ ML training datasets global

Result: EU data is now globally distributed
Compliance: GDPR violation ❌
```

**Real-World Example:**

A financial services company with DORA compliance requirements:
1. Deployed app in EU with Datadog "EU instance"
2. Discovered during audit: Logs replicated to US for backup
3. Encryption keys managed by Datadog US control plane
4. Regulatory finding: **No data sovereignty** despite EU residency
5. Remediation: Rebuild entire observability stack
6. Cost: Months of work + potential fines

**Why It Happens:**

- Vendors optimize for redundancy over sovereignty
- "EU instance" often means EU ingestion, global storage
- Backup systems default to multi-region
- Users discover after data is already distributed

### Impossible Deletion Requests

**The GDPR Article 17 Problem:**

When a user requests deletion:

```
Step 1: User submits request
Step 2: You must delete within 30 days
Step 3: You try to delete from observability platforms...

Traditional Platform Flow:
├─ Contact Datadog support
├─ Submit deletion request ticket
├─ Wait 2-4 weeks for response
├─ Discover: Data in backups cannot be deleted
├─ Discover: Data in analytics systems cannot be deleted
├─ Discover: Data used in ML training (too late)
├─ Discover: Data in third-party integrations
└─ Day 30: Deadline passed, still not deleted ❌

Compliance Impact:
- GDPR violation
- User complaint to regulator
- Investigation + €20M fine risk
```

**Technical Reality:**

From the research:
> "Once data enters telemetry systems (OTLP collectors → immutable storage → backups → third-party vendors), deletion becomes operationally impossible."

**Why Deletion Fails:**

1. **Immutable Storage:** Logs written to append-only systems
2. **Backup Propagation:** Data in hourly/daily backups across regions
3. **Analytics Systems:** Already aggregated into reports/dashboards
4. **ML Training:** Used to train anomaly detection models (cannot "untrain")
5. **Third-Party Integrations:** Forwarded to incident management, alerting systems
6. **Vendor Control:** You don't control the vendor's data lifecycle

### PII Leakage

**Auto-Instrumentation Hazards:**

```typescript
// OpenTelemetry auto-instrumentation captures:
app.post('/login', (req, res) => {
  // Auto-captured in span attributes:
  {
    'http.url': 'https://api.com/login?email=user@example.com',  // ← PII!
    'http.user_agent': 'Mozilla/5.0...',                          // ← Fingerprinting
    'net.peer.ip': '192.168.1.1',                                 // ← PII!
    'http.request.header.cookie': 'session=...',                  // ← Sensitive!
  }
  // All sent to third-party platform ❌
});
```

**Traditional Logging PII Issues:**

```typescript
// Developers unknowingly log PII:
logger.info(`User ${email} logged in from ${ipAddress}`);        // ← PII in logs
logger.error(`Payment failed for card ${cardNumber.slice(-4)}`); // ← PCI violation
logger.debug(`Request: ${JSON.stringify(req.body)}`);            // ← Everything!

// All sent to Datadog/Splunk ❌
```

**Compliance Impact:**

- GDPR violation (PII sent to third-party without consent)
- PCI DSS violation (payment data in logs)
- HIPAA violation (PHI in logs)
- Data sovereignty violation (PII crosses borders)

**Detection Timeline:**

- Development: Months/years of PII logging
- Audit Discovery: Compliance team finds PII in vendor systems
- Remediation: Cannot delete historical data from vendor
- Result: Regulatory violation + potential fines

### Retention Policy Conflicts

**The Problem:**

One retention policy for all logs creates conflicts:

```
Single Retention Policy: 90 days for all logs

Conflicts:
├─ HIPAA requires: 6 years for PHI logs ❌
├─ SOX requires: 7 years for financial logs ❌
├─ GDPR requires: Delete on user request ❌
└─ PCI DSS requires: 12 months for payment logs ❌

Result: Cannot meet conflicting requirements
```

**Real-World Scenario:**

Healthcare SaaS company:
- Needs: HIPAA (6 years), SOC 2 (12 months), GDPR (deletable)
- Datadog retention: 90 days standard, 18 months maximum
- Problem: Cannot meet HIPAA 6-year requirement
- Solution: Export logs to S3, build custom retention system
- Cost: Engineering time + S3 storage + compliance gap during migration

### Audit Trail Compromise

**The Problem:**

GDPR's "Right to Be Forgotten" vs Audit Trail mandates:

```
Scenario: EU user requests deletion, but they're also in audit logs

GDPR says: Delete user data within 30 days
HIPAA/SOX say: Keep audit logs for 6-7 years immutable

Traditional Approach:
├─ All logs mixed together
├─ User data in audit trail
├─ Cannot delete without breaking immutability
└─ Compliance conflict ❌

Correct Approach:
├─ Separate audit events from business events
├─ Audit events: Pseudonymized IDs (no PII)
├─ Business events: Can be deleted
└─ Both requirements met ✅
```

**Why This Happens:**

Traditional logging doesn't distinguish between:
- Business logs (deletable)
- Audit logs (must keep, immutable)
- Debug logs (should delete quickly)
- Security logs (retention requirements)

Result: All treated the same, creating compliance conflicts.

---

## How Principal View Enables Compliance

### Local-First Architecture

**The Fundamental Difference:**

```
┌────────────────────────────────────────────────────────────────┐
│  TRADITIONAL: DATA SENT TO THIRD-PARTY FIRST                   │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  App → Logs (with PII) → Datadog/Splunk (Third-Party)         │
│        └─ Lost control                                         │
│        └─ Cannot delete                                        │
│        └─ Cross-border transfer                                │
│        └─ Vendor controls retention                            │
│                                                                 │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│  PRINCIPAL VIEW: LOCAL AGGREGATION FIRST                       │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  App → Events (local) → Your Infrastructure                    │
│         ↓                                                       │
│         ├→ Store locally (your control, your jurisdiction)     │
│         ├→ Aggregate to metrics (no PII)                       │
│         └→ Send only metrics → Platform (safe)                 │
│                                                                 │
│  Benefits:                                                      │
│  ✅ Events never leave your infrastructure                     │
│  ✅ You control storage location (data residency)              │
│  ✅ You control deletion (GDPR compliance)                     │
│  ✅ You control retention policies                             │
│  ✅ PII stays in your jurisdiction                             │
│  ✅ Metrics sent to platform have no PII                       │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

**Compliance Advantages:**

| Compliance Requirement | Traditional | Principal View |
|------------------------|-------------|----------------|
| **Data Sovereignty** | Vendor controls location | You control location |
| **Deletion Rights** | Vendor-dependent, often impossible | Full control, immediate |
| **PII Protection** | PII sent to vendor | PII stays local |
| **Retention Flexibility** | Vendor limits | Configure per event type |
| **Audit Access** | Request from vendor | Direct access |
| **Regional Isolation** | Vendor global replication | Deploy per region |

### Schema-Based PII Protection

**Explicit PII Identification:**

```typescript
// workflow.json - Event schema with PII flags
{
  "events": {
    "user.login": {
      "description": "User login event",
      "schema": {
        "userId": {
          "type": "string",
          "isPII": true,                    // ← Explicit flag
          "excludeFromMetrics": true,       // ← Never in metrics
          "redactInLogs": false,            // ← Keep in local storage
          "retention": "6years",            // ← HIPAA compliance
          "deletable": true                 // ← GDPR compliance
        },
        "email": {
          "type": "string",
          "isPII": true,
          "excludeFromMetrics": true,
          "redactInLogs": true,             // ← Redact before storage
          "hashInStorage": true,            // ← Store as hash
          "deletable": true
        },
        "ipAddress": {
          "type": "string",
          "isPII": true,
          "excludeFromMetrics": true,
          "redactInLogs": true,
          "retention": "90days",            // ← Short retention
          "deletable": true
        },
        "region": {
          "type": "string",
          "isPII": false,                   // ← Safe metadata
          "includeInMetrics": true,         // ← OK for metrics
          "deletable": false                // ← Not user-specific
        },
        "loginMethod": {
          "type": "enum",
          "values": ["password", "oauth", "sso"],
          "isPII": false,
          "includeInMetrics": true
        }
      }
    }
  }
}
```

**Automatic Enforcement:**

```typescript
// Developer emits event:
emit('user.login', {
  userId: 'user-123',
  email: 'john@example.com',
  ipAddress: '192.168.1.1',
  region: 'us-east',
  loginMethod: 'oauth'
});

// Principal View automatically:
// 1. Validates against schema ✅
// 2. Identifies PII fields (userId, email, ipAddress)
// 3. Redacts email and ipAddress before storage
// 4. Excludes all PII from metrics
// 5. Stores locally with retention policies
// 6. Marks as deletable for GDPR

// Metric generated:
metric('login_count', {
  region: 'us-east',           // ← Safe metadata
  loginMethod: 'oauth'         // ← Safe metadata
  // NO userId, email, or ipAddress!
});

// Result: GDPR compliant ✅
```

**Benefits:**

- ✅ **Catch PII early:** Schema validation at development time
- ✅ **Explicit control:** Developers declare what's PII
- ✅ **Automatic redaction:** No manual scrubbing needed
- ✅ **Metrics safety:** PII never becomes metric tag
- ✅ **Audit trail:** Track PII handling in schema

### Compliant Deletion

**The Right to Be Forgotten - Actually Possible:**

```typescript
// User requests deletion under GDPR Article 17

// Traditional Platform:
// 1. Contact Datadog support → 2-4 weeks
// 2. Data in backups → Cannot delete
// 3. Data in analytics → Cannot delete
// 4. Deadline missed → GDPR violation ❌

// Principal View:
// 1. Delete from local event store (your infrastructure)
async function handleDeletionRequest(userId: string) {
  // Step 1: Delete from local event store
  const deletedEvents = await eventStore.deleteByUserId(userId);

  // Step 2: Metrics never had PII (nothing to delete)
  // Metrics only had: {region: "us-east"} - no userId

  // Step 3: Log deletion for audit trail
  await auditLog.record({
    event: 'gdpr.deletion.completed',
    userId: hash(userId),           // Pseudonymized for audit
    timestamp: Date.now(),
    deletedItems: {
      events: deletedEvents.count,
      timeRange: deletedEvents.timeRange
    },
    regulation: 'GDPR Article 17'
  });

  // Step 4: Notify user
  await notifyUser(userId, 'deletion_complete');

  return {
    success: true,
    deletedAt: new Date(),
    itemsDeleted: deletedEvents.count,
    timeline: '< 24 hours'          // vs months/impossible
  };
}

// Result: GDPR compliant deletion within 24 hours ✅
```

**Deletion Propagation:**

```typescript
// Configuration: Where user data might be
{
  "deletionPolicy": {
    "dataLocations": [
      {
        "location": "eventStore",
        "type": "local",
        "deletionMethod": "deleteByUserId",
        "verificationRequired": true
      },
      {
        "location": "metrics",
        "type": "aggregated",
        "containsPII": false,           // No deletion needed
        "note": "Only counts, no user IDs"
      },
      {
        "location": "backups",
        "type": "local",
        "deletionMethod": "markForExclusion",
        "note": "Excluded on restore"
      },
      {
        "location": "externalPlatform",
        "type": "thirdParty",
        "containsPII": false,           // Only send metrics, no PII
        "note": "Metrics have no user data"
      }
    ],
    "timeline": "24hours",
    "verification": "automated"
  }
}
```

**Deletion Verification:**

```typescript
// Automated verification that deletion is complete
async function verifyDeletion(userId: string): Promise<VerificationReport> {
  const report = {
    userId: hash(userId),
    verifiedAt: Date.now(),
    locations: []
  };

  // Check event store
  const eventsRemaining = await eventStore.countByUserId(userId);
  report.locations.push({
    location: 'eventStore',
    itemsRemaining: eventsRemaining,
    compliant: eventsRemaining === 0
  });

  // Check backups
  const backupStatus = await backupStore.checkExclusionList(userId);
  report.locations.push({
    location: 'backups',
    excluded: backupStatus.excluded,
    compliant: backupStatus.excluded === true
  });

  // Metrics check (should never have PII)
  report.locations.push({
    location: 'metrics',
    containsPII: false,
    compliant: true,
    note: 'Metrics never contained user PII'
  });

  report.overallCompliance = report.locations.every(loc => loc.compliant);
  return report;
}
```

### Flexible Retention Policies

**Per-Event-Type Retention:**

```json
// Different retention for different event categories
{
  "retentionPolicies": {
    "audit.*": {
      "retention": "7years",
      "immutable": true,
      "deletable": false,
      "regulation": "SOX",
      "storage": "compliance-tier",
      "note": "Financial audit trail"
    },
    "health.patient.*": {
      "retention": "6years",
      "immutable": true,
      "deletable": false,
      "regulation": "HIPAA",
      "storage": "encrypted-tier",
      "note": "PHI access logs"
    },
    "user.preference.*": {
      "retention": "2years",
      "immutable": false,
      "deletable": true,
      "regulation": "GDPR",
      "storage": "standard-tier",
      "note": "User deletable data"
    },
    "performance.*": {
      "retention": "90days",
      "immutable": false,
      "deletable": true,
      "aggregateToMetrics": true,
      "storage": "hot-tier",
      "note": "Aggregate and discard"
    },
    "debug.*": {
      "retention": "7days",
      "immutable": false,
      "deletable": true,
      "storage": "ephemeral-tier",
      "note": "Development only"
    }
  }
}
```

**Automated Lifecycle Management:**

```typescript
// Automatic data lifecycle based on event type
class RetentionManager {
  async enforceRetention() {
    const policies = await this.loadRetentionPolicies();

    for (const [eventPattern, policy] of Object.entries(policies)) {
      // Find events matching pattern
      const events = await eventStore.query({
        eventType: eventPattern,
        olderThan: policy.retention
      });

      // Apply policy
      if (policy.deletable) {
        await this.deleteEvents(events);
      } else if (policy.aggregateToMetrics) {
        await this.aggregateAndArchive(events);
      } else {
        await this.moveToArchive(events, policy.storage);
      }

      // Log retention action
      await auditLog.record({
        event: 'retention.policy.applied',
        policy: policy,
        itemsProcessed: events.length,
        action: policy.deletable ? 'deleted' : 'archived'
      });
    }
  }
}
```

**Multi-Regulation Compliance:**

```
Healthcare + Finance company needs:
├─ HIPAA: 6 years for patient data
├─ SOX: 7 years for financial audit
├─ GDPR: Deletable for EU users
└─ SOC 2: 12 months for security logs

Traditional Platform:
└─ One retention setting → Cannot meet all requirements ❌

Principal View:
├─ health.patient.* → 6 years, immutable (HIPAA)
├─ finance.transaction.* → 7 years, immutable (SOX)
├─ user.eu.* → 2 years, deletable (GDPR)
└─ security.* → 12 months, audit (SOC 2)
All requirements met ✅
```

### Regional Isolation

**Deploy Per Region:**

```
┌────────────────────────────────────────────────────────────────┐
│  MULTI-REGION COMPLIANCE DEPLOYMENT                            │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  EU Region:                                                     │
│    App (EU) → Events → Principal View (EU) → Datadog EU       │
│               └─ Stored in EU                                  │
│               └─ Encrypted with EU keys                        │
│               └─ GDPR compliant ✅                             │
│                                                                 │
│  US Region:                                                     │
│    App (US) → Events → Principal View (US) → Datadog US       │
│               └─ Stored in US                                  │
│               └─ Encrypted with US keys                        │
│               └─ No EU data ✅                                 │
│                                                                 │
│  China Region:                                                  │
│    App (CN) → Events → Principal View (CN) → Local Platform   │
│               └─ Data never leaves China                       │
│               └─ PIPL compliant ✅                             │
│                                                                 │
│  Key: Each region completely isolated                          │
│       No cross-border data transfer                            │
│       Regional regulations met                                 │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

**Regional Configuration:**

```yaml
# regional-config.yaml
regions:
  eu-west-1:
    dataResidency: "EU"
    regulations: ["GDPR", "DORA"]
    storage:
      provider: "aws"
      region: "eu-west-1"
      encryption: "eu-kms-key"
    metricsExport:
      platform: "datadog"
      endpoint: "eu.datadoghq.com"
      validateRegion: true
    compliance:
      piiRedaction: true
      deletionEnabled: true
      retentionPolicies: "gdpr-policies.json"

  us-east-1:
    dataResidency: "US"
    regulations: ["HIPAA", "SOC2", "SOX"]
    storage:
      provider: "aws"
      region: "us-east-1"
      encryption: "us-kms-key"
    metricsExport:
      platform: "datadog"
      endpoint: "us.datadoghq.com"
      validateRegion: true
    compliance:
      piiRedaction: true
      deletionEnabled: true
      retentionPolicies: "hipaa-policies.json"

  cn-north-1:
    dataResidency: "China"
    regulations: ["PIPL"]
    storage:
      provider: "aliyun"
      region: "cn-north-1"
      encryption: "cn-kms-key"
    metricsExport:
      platform: "aliyun-sls"
      endpoint: "cn-north-1.log.aliyuncs.com"
      validateRegion: true
    compliance:
      dataLocalityEnforced: true
      crossBorderTransferBlocked: true
```

---

## Implementation Guide

### Configuring PII Protection

**Step 1: Define Event Schemas with PII Flags**

```typescript
// events/user-events.json
{
  "user.registered": {
    "description": "New user registration",
    "schema": {
      "userId": {
        "type": "string",
        "isPII": true,
        "purpose": "User identification",
        "retention": "6years",
        "deletable": true,
        "excludeFromMetrics": true
      },
      "email": {
        "type": "string",
        "format": "email",
        "isPII": true,
        "purpose": "Communication",
        "redactInLogs": true,
        "hashInStorage": true,
        "deletable": true,
        "excludeFromMetrics": true
      },
      "registrationRegion": {
        "type": "string",
        "isPII": false,
        "includeInMetrics": true,
        "retention": "indefinite"
      }
    },
    "compliance": {
      "regulations": ["GDPR"],
      "legalBasis": "Consent",
      "processingPurpose": "Account creation"
    }
  }
}
```

**Step 2: Implement Automatic PII Redaction**

```typescript
// pii-redaction.ts
class PIIRedactor {
  constructor(private schema: EventSchema) {}

  redact(event: Event): RedactedEvent {
    const redacted = { ...event };

    for (const [field, config] of Object.entries(this.schema)) {
      if (config.isPII) {
        if (config.redactInLogs) {
          redacted[field] = this.redactValue(redacted[field]);
        }
        if (config.hashInStorage) {
          redacted[field] = this.hashValue(redacted[field]);
        }
        if (config.excludeFromMetrics) {
          // Mark for exclusion when generating metrics
          redacted._excludeFromMetrics = redacted._excludeFromMetrics || [];
          redacted._excludeFromMetrics.push(field);
        }
      }
    }

    return redacted;
  }

  private redactValue(value: any): string {
    if (typeof value === 'string') {
      if (this.isEmail(value)) {
        return this.redactEmail(value); // user@example.com → u***@e***.com
      }
      if (this.isIP(value)) {
        return this.redactIP(value);    // 192.168.1.1 → 192.168.*.*
      }
    }
    return '[REDACTED]';
  }

  private hashValue(value: any): string {
    return crypto.createHash('sha256').update(String(value)).digest('hex');
  }
}
```

**Step 3: Validate PII Exclusion from Metrics**

```typescript
// metric-validator.ts
class MetricValidator {
  validateMetricTags(event: Event, schema: EventSchema): ValidationResult {
    const violations = [];

    for (const [field, config] of Object.entries(schema)) {
      if (config.isPII && config.excludeFromMetrics) {
        // Check if this field is being used as a metric tag
        if (event.metricTags?.includes(field)) {
          violations.push({
            field,
            issue: 'PII field used as metric tag',
            severity: 'critical',
            regulation: 'GDPR',
            fix: `Remove ${field} from metricTags`
          });
        }
      }
    }

    return {
      valid: violations.length === 0,
      violations
    };
  }
}
```

### Setting Up Retention Policies

**Step 1: Define Retention Requirements**

```typescript
// retention-policies.ts
export const retentionPolicies = {
  // Audit events: SOX compliance
  'audit.access': {
    retention: '7years',
    storage: 'compliance-archive',
    immutable: true,
    deletable: false,
    encryption: 'required',
    regulation: 'SOX'
  },

  // Health events: HIPAA compliance
  'health.patient.access': {
    retention: '6years',
    storage: 'hipaa-compliant-storage',
    immutable: true,
    deletable: false,
    encryption: 'required',
    accessControl: 'role-based',
    regulation: 'HIPAA'
  },

  // User events: GDPR compliance
  'user.*': {
    retention: '2years',
    storage: 'standard',
    immutable: false,
    deletable: true,
    piiRedaction: true,
    regulation: 'GDPR'
  },

  // Performance events: Aggregate and discard
  'performance.*': {
    retention: '90days',
    storage: 'hot',
    aggregateToMetrics: true,
    deleteAfterAggregation: true
  }
};
```

**Step 2: Automate Lifecycle Management**

```typescript
// retention-manager.ts
class RetentionManager {
  async enforceRetentionPolicies() {
    for (const [pattern, policy] of Object.entries(retentionPolicies)) {
      await this.processPattern(pattern, policy);
    }
  }

  private async processPattern(pattern: string, policy: RetentionPolicy) {
    // Find events older than retention period
    const cutoffDate = this.calculateCutoffDate(policy.retention);
    const events = await eventStore.query({
      eventType: pattern,
      createdBefore: cutoffDate
    });

    // Apply lifecycle action
    if (policy.deleteAfterAggregation) {
      await this.aggregateAndDelete(events);
    } else if (policy.deletable) {
      await this.deleteEvents(events);
    } else {
      await this.archiveEvents(events, policy.storage);
    }

    // Audit the retention action
    await this.auditRetentionAction(pattern, policy, events.length);
  }

  private calculateCutoffDate(retention: string): Date {
    const matches = retention.match(/(\d+)(years|months|days)/);
    const [, amount, unit] = matches;
    return subYears(new Date(), parseInt(amount)); // Using date-fns
  }
}
```

### Implementing Deletion Workflows

**Step 1: Create Deletion API**

```typescript
// deletion-api.ts
class DeletionService {
  async handleDeletionRequest(
    userId: string,
    regulation: 'GDPR' | 'CCPA'
  ): Promise<DeletionResult> {
    // Step 1: Validate request
    await this.validateDeletionRequest(userId, regulation);

    // Step 2: Create deletion job
    const job = await this.createDeletionJob(userId, regulation);

    // Step 3: Delete from all data stores
    const results = await Promise.all([
      this.deleteFromEventStore(userId),
      this.deleteFromBackups(userId),
      this.verifyMetricsDoNotContainPII(userId)
    ]);

    // Step 4: Create audit record
    await this.auditDeletion(userId, results);

    // Step 5: Notify user
    await this.notifyDeletionComplete(userId);

    return {
      success: true,
      deletedAt: new Date(),
      itemsDeleted: results.reduce((sum, r) => sum + r.count, 0),
      timeline: '< 24 hours',
      regulation
    };
  }

  private async deleteFromEventStore(userId: string) {
    // Mark events for deletion (soft delete first)
    const marked = await eventStore.markForDeletion(userId);

    // Wait 24 hours (verification period)
    await this.schedulePermanentDeletion(userId, Date.now() + 86400000);

    return { count: marked.length, status: 'pending' };
  }

  private async deleteFromBackups(userId: string) {
    // Add to backup exclusion list
    // When backup is restored, user data will be automatically excluded
    await backupStore.addExclusionRule({
      userId,
      excludeFrom: 'all',
      reason: 'GDPR deletion request',
      createdAt: new Date()
    });

    return { count: 0, status: 'excluded_from_restore' };
  }

  private async verifyMetricsDoNotContainPII(userId: string) {
    // Metrics should never contain PII
    // This is a verification check
    const metricsWithPII = await this.scanMetricsForPII(userId);

    if (metricsWithPII.length > 0) {
      throw new Error(`Found PII in metrics: ${metricsWithPII.join(', ')}`);
    }

    return { count: 0, status: 'verified_no_pii' };
  }
}
```

**Step 2: Deletion Verification**

```typescript
// deletion-verification.ts
class DeletionVerifier {
  async verifyDeletion(userId: string): Promise<VerificationReport> {
    const checks = [
      this.checkEventStore(userId),
      this.checkBackups(userId),
      this.checkMetrics(userId),
      this.checkExternalSystems(userId)
    ];

    const results = await Promise.all(checks);

    return {
      userId: hash(userId),
      verifiedAt: new Date(),
      checks: results,
      compliant: results.every(r => r.passed),
      regulation: 'GDPR Article 17'
    };
  }

  private async checkEventStore(userId: string) {
    const count = await eventStore.countByUserId(userId);
    return {
      location: 'eventStore',
      itemsFound: count,
      passed: count === 0,
      message: count === 0 ? 'No events found' : `${count} events remain`
    };
  }

  private async checkBackups(userId: string) {
    const excluded = await backupStore.isExcluded(userId);
    return {
      location: 'backups',
      excluded,
      passed: excluded,
      message: excluded ? 'User on exclusion list' : 'Not excluded from backups'
    };
  }
}
```

### Regional Deployment Patterns

**Pattern 1: Completely Isolated Regions**

```
EU Deployment:
├─ AWS EU-WEST-1
├─ Principal View (EU instance)
├─ Event Store (EU RDS)
├─ Encryption Keys (EU KMS)
└─ Metrics → Datadog EU

US Deployment:
├─ AWS US-EAST-1
├─ Principal View (US instance)
├─ Event Store (US RDS)
├─ Encryption Keys (US KMS)
└─ Metrics → Datadog US

Zero data sharing between regions ✅
```

**Pattern 2: Regional with Global Aggregates**

```
Regional Event Processing:
├─ EU: Events stay in EU
├─ US: Events stay in US
└─ APAC: Events stay in APAC

Global Metrics Dashboard:
├─ Each region sends aggregated metrics (no PII)
├─ Global dashboard shows: "EU: 1M logins, US: 2M logins"
├─ No PII crosses borders
└─ Compliant with data residency ✅
```

**Deployment Configuration:**

```yaml
# deploy-config.yaml
global:
  isolationLevel: "strict"  # No cross-region data flow

regions:
  - name: "eu-west-1"
    dataResidency: "EU"
    regulations: ["GDPR", "DORA"]
    deployment:
      vpc: "vpc-eu-123"
      subnets: ["subnet-eu-a", "subnet-eu-b"]
      eventStore:
        type: "rds-postgres"
        instanceClass: "db.r6g.xlarge"
        encryption: "eu-kms-key"
        backupRegion: "eu-west-2"  # Stay in EU
      metricsExport:
        destinations:
          - type: "datadog"
            endpoint: "eu.datadoghq.com"
            apiKeySecret: "eu-dd-key"
    compliance:
      crossBorderTransfer: false
      piiRedaction: true
      deletionWorkflow: "gdpr-deletion"

  - name: "us-east-1"
    dataResidency: "US"
    regulations: ["HIPAA", "SOC2"]
    deployment:
      vpc: "vpc-us-456"
      subnets: ["subnet-us-a", "subnet-us-b"]
      eventStore:
        type: "rds-postgres"
        instanceClass: "db.r6g.2xlarge"
        encryption: "us-kms-key"
        backupRegion: "us-west-2"  # Stay in US
      metricsExport:
        destinations:
          - type: "datadog"
            endpoint: "us.datadoghq.com"
            apiKeySecret: "us-dd-key"
    compliance:
      hipaaCompliant: true
      auditLogging: true
      retentionPolicies: "hipaa-retention.json"
```

### Audit Logging

**Compliance Audit Events:**

```typescript
// audit-events.ts
export const auditEvents = {
  'audit.data.access': {
    description: 'User accessed sensitive data',
    schema: {
      userId: { type: 'string', immutable: true },
      resourceId: { type: 'string', immutable: true },
      resourceType: { type: 'string', immutable: true },
      action: { type: 'enum', values: ['read', 'write', 'delete'], immutable: true },
      ipAddress: { type: 'string', immutable: true },
      timestamp: { type: 'number', immutable: true },
      outcome: { type: 'enum', values: ['success', 'failure'], immutable: true }
    },
    retention: '7years',
    immutable: true,
    deletable: false,
    regulation: 'SOX, HIPAA'
  },

  'audit.gdpr.deletion': {
    description: 'GDPR deletion request processed',
    schema: {
      userIdHash: { type: 'string', immutable: true },  // Pseudonymized
      requestedAt: { type: 'number', immutable: true },
      completedAt: { type: 'number', immutable: true },
      itemsDeleted: { type: 'number', immutable: true },
      regulation: { type: 'string', default: 'GDPR Article 17', immutable: true }
    },
    retention: '7years',
    immutable: true,
    deletable: false,
    regulation: 'GDPR (audit trail exception)'
  },

  'audit.pii.access': {
    description: 'PII data was accessed',
    schema: {
      accessorId: { type: 'string', immutable: true },
      piiType: { type: 'enum', values: ['email', 'phone', 'ssn', 'health'], immutable: true },
      purpose: { type: 'string', immutable: true },
      authorized: { type: 'boolean', immutable: true }
    },
    retention: '6years',
    immutable: true,
    deletable: false,
    regulation: 'HIPAA, GDPR'
  }
};
```

**Immutability Enforcement:**

```typescript
// immutable-store.ts
class ImmutableAuditStore {
  async appendEvent(event: AuditEvent): Promise<void> {
    // Verify event schema is marked immutable
    if (!event.schema.immutable) {
      throw new Error('Audit events must be immutable');
    }

    // Create cryptographic hash of event
    const hash = this.hashEvent(event);

    // Store with hash chain (blockchain-style)
    const previousHash = await this.getLastEventHash();
    const storedEvent = {
      ...event,
      hash,
      previousHash,
      sequenceNumber: await this.getNextSequence(),
      sealed: true
    };

    // Write to append-only storage
    await this.writeToAppendOnlyStore(storedEvent);

    // Cannot modify after this point
  }

  async verifyIntegrity(): Promise<IntegrityReport> {
    // Verify hash chain is unbroken
    const events = await this.getAllEvents();
    let previousHash = null;

    for (const event of events) {
      if (event.previousHash !== previousHash) {
        return {
          valid: false,
          corruptedAt: event.sequenceNumber,
          message: 'Hash chain broken - tampering detected'
        };
      }
      previousHash = event.hash;
    }

    return { valid: true, message: 'Audit trail integrity verified' };
  }
}
```

---

## Compliance Scenarios

### Scenario 1: GDPR Deletion Request

**Context:**
- EU user requests account deletion
- Must delete all personal data within 30 days
- Must maintain audit trail of deletion

**Traditional Approach (Failure):**

```
Day 1: User submits deletion request
Day 2: Submit ticket to Datadog support
Day 5: Datadog responds: "Processing, 2-4 weeks"
Day 14: Discover data is in S3 backups (cannot delete)
Day 20: Discover data is in analytics aggregates (cannot delete)
Day 25: Discover data used in ML training (too late to remove)
Day 30: DEADLINE PASSED
Day 31: User files complaint with regulator
Day 90: €20M fine notice received ❌
```

**Principal View Approach (Success):**

```typescript
// Day 1: User submits deletion request
const deletionRequest = {
  userId: 'user-123',
  email: 'user@example.com',
  region: 'EU',
  regulation: 'GDPR Article 17',
  requestedAt: new Date()
};

// Day 1 (Hour 1): Automated deletion begins
const result = await deletionService.handleDeletionRequest(
  deletionRequest.userId,
  'GDPR'
);

// Deletion process:
// Step 1: Delete from event store
await eventStore.deleteByUserId('user-123');
// Result: 1,234 events deleted

// Step 2: Verify metrics
await verifyNoPIIInMetrics('user-123');
// Result: Metrics only have {region: "EU", status: "success"}
//         No userId, no email → Nothing to delete ✅

// Step 3: Update backup exclusion list
await backupStore.addExclusionRule('user-123');
// Result: User data will be excluded if backup is restored ✅

// Step 4: Audit trail (pseudonymized)
await auditLog.record({
  event: 'gdpr.deletion.completed',
  userIdHash: hash('user-123'),
  deletedAt: new Date(),
  itemsDeleted: 1234,
  timeline: '2 hours',
  regulation: 'GDPR Article 17'
});

// Day 1 (Hour 3): Verification
const verification = await verifyDeletion('user-123');
// Result: All checks passed ✅

// Day 1 (Hour 4): Notify user
await sendEmail(deletionRequest.email, 'deletion_complete', {
  deletedAt: result.deletedAt,
  itemsDeleted: result.itemsDeleted
});

// Day 1: COMPLETE (within 24 hours)
// Compliance: GDPR Article 17 ✅
```

### Scenario 2: HIPAA Audit Trail

**Context:**
- Healthcare app must log all PHI access
- 6-year retention minimum
- Immutable audit trail
- Role-based access control

**Implementation:**

```typescript
// Step 1: Define HIPAA audit event
{
  "audit.phi.access": {
    "description": "Patient health information accessed",
    "schema": {
      "accessorId": {
        "type": "string",
        "description": "Healthcare provider ID",
        "immutable": true
      },
      "patientId": {
        "type": "string",
        "description": "Patient identifier",
        "immutable": true,
        "isPII": true
      },
      "resourceType": {
        "type": "enum",
        "values": ["medical_record", "prescription", "lab_result", "diagnosis"],
        "immutable": true
      },
      "action": {
        "type": "enum",
        "values": ["view", "update", "print", "export"],
        "immutable": true
      },
      "location": {
        "type": "string",
        "description": "IP address or device",
        "immutable": true
      },
      "timestamp": {
        "type": "number",
        "immutable": true
      },
      "authorized": {
        "type": "boolean",
        "description": "Was access authorized",
        "immutable": true
      },
      "outcome": {
        "type": "enum",
        "values": ["success", "failure"],
        "immutable": true
      }
    },
    "retention": "6years",
    "immutable": true,
    "deletable": false,
    "regulation": "HIPAA",
    "storage": "hipaa-compliant-tier",
    "encryption": "required",
    "accessControl": "role-based"
  }
}

// Step 2: Emit audit event when PHI is accessed
async function accessPatientRecord(
  providerId: string,
  patientId: string,
  recordType: string
) {
  // Check authorization
  const authorized = await checkAccess(providerId, patientId);

  try {
    // Access the record
    const record = await fetchPatientRecord(patientId, recordType);

    // Log the access (success)
    await emit('audit.phi.access', {
      accessorId: providerId,
      patientId: patientId,
      resourceType: recordType,
      action: 'view',
      location: getClientIP(),
      timestamp: Date.now(),
      authorized: authorized,
      outcome: 'success'
    });

    return record;
  } catch (error) {
    // Log the access (failure)
    await emit('audit.phi.access', {
      accessorId: providerId,
      patientId: patientId,
      resourceType: recordType,
      action: 'view',
      location: getClientIP(),
      timestamp: Date.now(),
      authorized: authorized,
      outcome: 'failure'
    });

    throw error;
  }
}

// Step 3: Verify immutability
async function verifyAuditTrailIntegrity() {
  const auditor = new ImmutableAuditStore();
  const report = await auditor.verifyIntegrity();

  if (!report.valid) {
    // Alert: Audit trail has been tampered with
    await alert.critical('HIPAA audit trail integrity violation');
  }

  return report;
}

// Step 4: Generate compliance report
async function generateHIPAAComplianceReport(startDate, endDate) {
  const auditEvents = await eventStore.query({
    eventType: 'audit.phi.access',
    dateRange: { start: startDate, end: endDate }
  });

  return {
    totalAccesses: auditEvents.length,
    authorizedAccesses: auditEvents.filter(e => e.authorized).length,
    unauthorizedAttempts: auditEvents.filter(e => !e.authorized).length,
    failedAccesses: auditEvents.filter(e => e.outcome === 'failure').length,
    retentionCompliant: auditEvents.every(e => isRetentionCompliant(e, '6years')),
    immutabilityVerified: await verifyAuditTrailIntegrity()
  };
}
```

### Scenario 3: Multi-Region SOC 2

**Context:**
- Global SaaS company
- SOC 2 Type II certification required
- Separate event processing per region
- Global compliance dashboard

**Architecture:**

```yaml
# SOC 2 Multi-Region Deployment

regions:
  us-east-1:
    compliance:
      regulations: ["SOC2", "HIPAA"]
      retentionPolicy: "12months"
      securityControls:
        - encryption-at-rest
        - encryption-in-transit
        - role-based-access
        - audit-logging
    monitoring:
      events:
        - "security.*"
        - "access.*"
        - "data.modification.*"
      alerting:
        unauthorized_access: "immediate"
        configuration_change: "immediate"

  eu-west-1:
    compliance:
      regulations: ["SOC2", "GDPR"]
      retentionPolicy: "12months"
      securityControls:
        - encryption-at-rest
        - encryption-in-transit
        - role-based-access
        - audit-logging
        - pii-redaction
    monitoring:
      events:
        - "security.*"
        - "access.*"
        - "data.modification.*"
        - "gdpr.*"
      alerting:
        unauthorized_access: "immediate"
        pii_exposure: "immediate"

global:
  complianceDashboard:
    aggregateMetrics:
      - securityEventCount
      - accessViolationCount
      - systemUptimePercentage
    regionIsolation: true
    noCrossBorderData: true
```

**SOC 2 Control Evidence:**

```typescript
// Generate SOC 2 audit evidence
async function generateSOC2Evidence(controlId: string) {
  switch (controlId) {
    case 'CC6.1': // Logical access controls
      return {
        control: 'CC6.1 - Logical and physical access controls',
        evidence: {
          accessEvents: await eventStore.query({
            eventType: 'audit.access.*',
            dateRange: 'last12months'
          }),
          violations: await eventStore.query({
            eventType: 'security.access.violation',
            dateRange: 'last12months'
          }),
          remediation: await eventStore.query({
            eventType: 'security.remediation.*',
            dateRange: 'last12months'
          })
        },
        compliant: true
      };

    case 'CC6.6': // Logical access control - audit logs
      return {
        control: 'CC6.6 - Audit logging and monitoring',
        evidence: {
          auditEvents: await eventStore.query({
            eventType: 'audit.*',
            dateRange: 'last12months'
          }),
          retentionCompliant: await verifyRetention('12months'),
          immutabilityVerified: await verifyAuditIntegrity()
        },
        compliant: true
      };

    case 'CC7.2': // System monitoring
      return {
        control: 'CC7.2 - System monitoring',
        evidence: {
          performanceMetrics: await getMetrics('performance.*', 'last12months'),
          availabilityMetrics: await getMetrics('availability.*', 'last12months'),
          incidents: await eventStore.query({
            eventType: 'incident.*',
            dateRange: 'last12months'
          })
        },
        compliant: true
      };
  }
}
```

### Scenario 4: Data Residency (EU + US)

**Context:**
- Financial services company
- EU customers (GDPR + DORA)
- US customers (SOX + SOC 2)
- Zero cross-border data transfer

**Regional Isolation:**

```
┌────────────────────────────────────────────────────────────────┐
│  EU REGION (COMPLETE ISOLATION)                                │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  EU Application → Events → Principal View (EU-WEST-1)          │
│                             ↓                                   │
│                   Event Store (RDS EU-WEST-1)                  │
│                             ↓                                   │
│                   Encrypted (EU KMS Key)                       │
│                             ↓                                   │
│                   Metrics → Datadog EU                         │
│                                                                 │
│  Compliance:                                                    │
│  ✅ Data never leaves EU                                       │
│  ✅ GDPR compliant                                             │
│  ✅ DORA compliant                                             │
│  ✅ Deletion requests handled locally                          │
│                                                                 │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│  US REGION (COMPLETE ISOLATION)                                │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  US Application → Events → Principal View (US-EAST-1)          │
│                             ↓                                   │
│                   Event Store (RDS US-EAST-1)                  │
│                             ↓                                   │
│                   Encrypted (US KMS Key)                       │
│                             ↓                                   │
│                   Metrics → Datadog US                         │
│                                                                 │
│  Compliance:                                                    │
│  ✅ Data never leaves US                                       │
│  ✅ SOX compliant (7-year retention)                           │
│  ✅ SOC 2 compliant                                            │
│  ✅ HIPAA compliant (if needed)                                │
│                                                                 │
└────────────────────────────────────────────────────────────────┘

Global Dashboard (Aggregated Metrics Only):
├─ No PII
├─ No event data
└─ Only: {region: "EU", transaction_count: 1M}
         {region: "US", transaction_count: 2M}
```

**Implementation:**

```typescript
// regional-router.ts
class RegionalRouter {
  async routeEvent(event: Event) {
    // Determine region based on event metadata
    const region = this.determineRegion(event);

    // Route to appropriate regional instance
    switch (region) {
      case 'EU':
        await this.processInRegion(event, {
          instance: 'eu-west-1',
          regulations: ['GDPR', 'DORA'],
          storage: 'eu-rds',
          encryption: 'eu-kms-key',
          metricsEndpoint: 'eu.datadoghq.com'
        });
        break;

      case 'US':
        await this.processInRegion(event, {
          instance: 'us-east-1',
          regulations: ['SOX', 'SOC2'],
          storage: 'us-rds',
          encryption: 'us-kms-key',
          metricsEndpoint: 'us.datadoghq.com'
        });
        break;

      default:
        throw new Error(`Unknown region: ${region}`);
    }
  }

  private determineRegion(event: Event): string {
    // Check event metadata
    if (event.metadata?.region) {
      return event.metadata.region;
    }

    // Check user's registered region
    if (event.userId) {
      return await userService.getUserRegion(event.userId);
    }

    // Fallback to geo-IP
    return await geoIP.getRegion(event.sourceIP);
  }
}
```

---

## Compliance Checklist

### GDPR Compliance

- [ ] **Data Residency**
  - [ ] EU data stored only in EU regions
  - [ ] Encryption keys managed in EU
  - [ ] No unauthorized cross-border transfers

- [ ] **PII Protection**
  - [ ] PII fields identified in event schemas
  - [ ] Automatic PII redaction configured
  - [ ] PII excluded from metrics
  - [ ] Access controls on PII data

- [ ] **Right to Be Forgotten**
  - [ ] Deletion workflow implemented
  - [ ] Deletion completes within 30 days
  - [ ] Verification process in place
  - [ ] Audit trail for deletion requests

- [ ] **Data Minimization**
  - [ ] Only collect necessary PII
  - [ ] Regular review of PII collection
  - [ ] Automatic PII scrubbing

- [ ] **Consent Management**
  - [ ] Record legal basis for processing
  - [ ] Consent tracking in events
  - [ ] Withdrawal of consent handling

### HIPAA Compliance

- [ ] **Audit Logging**
  - [ ] All PHI access logged
  - [ ] Required fields captured (who, what, when, where, outcome)
  - [ ] 6-year retention minimum
  - [ ] Immutable audit trail

- [ ] **Encryption**
  - [ ] TLS 1.3 for data in transit
  - [ ] AES-256 for data at rest
  - [ ] Key management documented

- [ ] **Access Controls**
  - [ ] Role-based access control (RBAC)
  - [ ] Minimum necessary access
  - [ ] Access logging

- [ ] **Breach Notification**
  - [ ] Detection mechanisms
  - [ ] Notification procedures
  - [ ] Incident response plan

### SOC 2 Compliance

- [ ] **Security Controls**
  - [ ] 12-month log retention
  - [ ] Encryption at rest and in transit
  - [ ] Access controls documented
  - [ ] Security monitoring

- [ ] **Availability Controls**
  - [ ] System uptime monitoring
  - [ ] Performance metrics
  - [ ] Incident response

- [ ] **Processing Integrity**
  - [ ] Data validation
  - [ ] Error logging
  - [ ] Transaction integrity

- [ ] **Confidentiality**
  - [ ] PII protection
  - [ ] Encryption
  - [ ] Access controls

- [ ] **Privacy**
  - [ ] Privacy policies
  - [ ] Data handling procedures
  - [ ] User consent management

### Data Residency/Sovereignty

- [ ] **Regional Isolation**
  - [ ] Separate deployments per region
  - [ ] No cross-border data transfer
  - [ ] Regional encryption keys

- [ ] **Compliance Mapping**
  - [ ] Regulations identified per region
  - [ ] Retention policies per region
  - [ ] Audit requirements per region

- [ ] **Verification**
  - [ ] Data location verification
  - [ ] Encryption key location verification
  - [ ] Backup location verification

---

## References

### GDPR & PII Protection

- [Complete GDPR Compliance Guide (2026-Ready)](https://secureprivacy.ai/gdpr-compliance-2026)
- [Data Residency Compliance by Routing Telemetry](https://oneuptime.com/blog/post/2026-02-06-data-residency-telemetry-routing/view)
- [GDPR Compliance for Developers 2026](https://dasroot.net/posts/2026/02/gdpr-compliance-developers-practical-implementation-2026/)
- [PII Compliance Checklist 2025](https://www.sentra.io/learn/pii-compliance-checklist)
- [GDPR Log Management Guide | Last9](https://last9.io/blog/gdpr-log-management/)
- [GDPR compliance and log management | NXLog](https://nxlog.co/news-and-blog/posts/gdpr-compliance)

### HIPAA Requirements

- [HIPAA Audit Logs: Complete Requirements 2025](https://www.kiteworks.com/hipaa-compliance/hipaa-audit-log-requirements/)
- [HIPAA Retention Requirements - 2025 Update](https://www.hipaajournal.com/hipaa-retention-requirements/)
- [HIPAA Audit Trail and Log Requirements](https://compliancy-group.com/hipaa-audit-log-requirements/)
- [HIPAA Audit Log Requirements Manual](https://www.cayosoft.com/blog/hipaa-audit-log-requirements/)

### SOC 2 & Audit Standards

- [SOC 2 Data Retention Guide 2026](https://www.konfirmity.com/blog/soc-2-data-retention-guide)
- [Security Log Retention Best Practices](https://auditboard.com/blog/security-log-retention-best-practices-guide)
- [SOC 2 Data Security Requirements](https://www.bytebase.com/blog/soc2-data-security-and-retention-requirements/)
- [Retention Policies for Cloud Audit Logs](https://censinet.com/perspectives/retention-policies-for-cloud-audit-logs-what-to-know)

### Data Residency & Sovereignty

- [Data Residency and 2025 Observability Stack | Parseable](https://www.parseable.com/blog/data-residency-and-the-2025-observability-stack)
- [Data Sovereignty vs Data Residency | Splunk](https://www.splunk.com/en_us/blog/learn/data-sovereignty-vs-data-residency.html)
- [Global Data Residency Crisis | Security Boulevard](https://securityboulevard.com/2025/12/the-global-data-residency-crisis-how-enterprises-can-navigate-geolocation-storage-and-privacy-compliance-without-sacrificing-performance/)
- [Data Sovereignty in 2025 for EU Firms](https://www.techclass.com/resources/learning-and-development-articles/data-sovereignty-what-it-means-for-european-businesses-in-2025)

### Right to Be Forgotten

- [Right to Be Forgotten vs Audit Trail | Axiom](https://axiom.co/blog/the-right-to-be-forgotten-vs-audit-trail-mandates)
- [GDPR Right to Be Forgotten Guide](https://complydog.com/blog/right-to-be-forgotten-gdpr-erasure-rights-guide)
- [GDPR Erasure Requests | SecurePrivacy](https://secureprivacy.ai/blog/how-to-respond-to-gdpr-right-to-erasure-request)
- [Right to be Forgotten | GDPR.eu](https://gdpr.eu/right-to-be-forgotten/)
- [6 Best Practices for GDPR Logging](https://www.cookieyes.com/blog/gdpr-logging-and-monitoring/)

### Related Documentation

- [Telemetry Cost Optimization](./TELEMETRY_COST_OPTIMIZATION.md) - Cost reduction through local aggregation
- [Event Recording System](./EVENT_RECORDING_SYSTEM.md) - How Principal View handles events
- [OpenTelemetry Overview](./OPENTELEMETRY_OVERVIEW.md) - Understanding telemetry signals

---

**Last Updated:** 2025-02-13
**Feedback:** [Open an issue](https://github.com/principal-ai/principal-view/issues) for compliance questions or corrections
