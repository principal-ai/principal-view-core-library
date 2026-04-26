# Patent Notice

## Provisional Patent Applications (Pending Filing)

This software implements novel technology for which provisional patent applications are being prepared:

### Path-Based Component Association for Real-Time System Monitoring

**Status**: Provisional Patent Application - To Be Filed
**Expected Filing**: Q1 2025

**Core Innovation**:
A system and method for associating runtime logs and events with architectural components based on source file paths rather than content parsing, enabling automatic component-based monitoring and visualization of distributed systems.

**Technology Coverage**:

- Source-path-based log-to-component association using glob pattern matching
- Automatic extraction of caller source paths from stack traces
- Instance ID resolution for multi-instance component differentiation
- Progressive enhancement from basic path association to action pattern matching
- Configuration-driven component mapping via `.principal-views/` folder

**Applicable Components**:

- Path-based event processor (packages/core/src/PathBasedEventProcessor.ts)
- Enhanced logger with automatic source capture (packages/logger/)
- Component source mapping configuration system
- Instance identifier propagation through log metadata
- Event categorization based on source file location

---

### Event Recording and Visual Validation Framework

**Status**: Provisional Patent Application - To Be Filed
**Expected Filing**: Q1 2025

**Core Innovation**:
A session-based event recording and playback system for capturing test execution behavior and visually validating distributed system interactions through graph-based replay.

**Technology Coverage**:

- Session-based event recording with auto-creation per test case
- WebSocket protocol for streaming log ingestion during test execution
- Multi-mode recording (manual, auto-test, continuous)
- Event-to-graph transformation for visual playback
- CI/CD integration with exportable test session recordings
- Configuration-driven graph validation rules engine

**Applicable Components**:

- Event recording system (docs/EVENT_RECORDING_SYSTEM.md implementation)
- Session manager for organizing test-based event streams
- WebSocket server for real-time log ingestion
- Event processor with path-based and action pattern matching
- Visual playback controls (packages/react/src/components/EventControllerPanel.tsx)
- Rules engine for configuration quality validation (docs/RULES_ENGINE_DESIGN.md)

---

### Configuration-Driven Graph Validation Framework

**Status**: Included with Event Recording patent
**Expected Filing**: Q1 2025

**Technology Coverage**:

- Pluggable rules engine for validating graph configuration quality
- Schema validation, reference integrity, and structural analysis
- Auto-fix capabilities for certain rule violations
- ESLint-style configuration with extends/override patterns
- Multi-configuration support via `.principal-views/` folder system

**Applicable Components**:

- GraphRulesEngine and rule implementations
- Configuration loader with FileSystemAdapter pattern
- Configuration selector for multi-view switching
- Validation reporting with actionable suggestions

## Patent Grant

This software is licensed under the Apache License 2.0, which includes an express grant of patent rights from contributors to users. See the LICENSE file for full details.

### Key Patent Terms

**Grant**: Users receive a perpetual, worldwide, non-exclusive, no-charge, royalty-free, irrevocable patent license to use this software.

**Termination**: If you initiate patent litigation claiming that this software infringes your patents, your patent license terminates automatically.

**Defensive Protection**: This ensures the software remains free to use while protecting contributors from patent litigation.

## Commercial Licensing

For commercial licensing inquiries or questions about patent rights beyond the Apache 2.0 grant, please contact:

**Principal AI Team**
Email: [licensing contact - to be added]
Website: https://principal.ai

## Additional Information

- **Patent Pending**: Provisional patent applications will be filed in Q1 2025 covering these innovations
- **Non-Assert Covenant**: Upon filing, Principal AI will not assert patents covered by this software against users complying with the Apache 2.0 license
- **Open Source Commitment**: Principal AI is committed to keeping this core technology available under permissive open source licensing
- **Innovation Tracking**: This document will be updated as patent applications are filed and granted

---

**Last Updated**: December 12, 2024
**Document Version**: 1.0
**Patent Status**: Pre-filing (provisional applications in preparation)
