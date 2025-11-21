# @principal-ai/visual-validation-logger

Enhanced logger with automatic source path capture for the Visual Validation Framework.

## Features

- **Automatic Source Capture**: Uses stack trace analysis to capture the file path, line, and column of each log
- **Logger Wrapping**: Easily wrap existing loggers (winston, bunyan, pino, console)
- **Zero Configuration**: Works out of the box with sensible defaults
- **Lightweight**: Minimal overhead (<10ms per log)
- **Transport System**: Flexible transport system for routing logs to VVF

## Installation

```bash
bun add @principal-ai/visual-validation-logger
```

## Quick Start

### Wrap Existing Logger

```typescript
import winston from 'winston';
import { enhanceLogger } from '@principal-ai/visual-validation-logger';

// Your existing logger
const logger = winston.createLogger({
  transports: [new winston.transports.Console()]
});

// Enhance it with VVF source capture
enhanceLogger(logger, {
  projectRoot: __dirname,
  captureSource: true
});

// Use as normal - source info is captured automatically
logger.info('Lock acquired for branch-123');
// Source: { file: 'lib/lock-manager.ts', line: 42 }
```

### Create Standalone Logger

```typescript
import { createLogger } from '@principal-ai/visual-validation-logger';

const logger = createLogger({
  projectRoot: __dirname,
  level: 'info'
});

logger.info('Starting server...');
logger.error('Connection failed', { reason: 'timeout' });
```

### Connect to Visual Validation Framework

```typescript
import { enhanceLogger, createVVFTransport } from '@principal-ai/visual-validation-logger';
import { PathBasedEventProcessor } from '@principal-ai/visual-validation-core';

// Create event processor
const processor = new PathBasedEventProcessor(graphConfig);

// Create transport that sends logs to VVF
const vvfTransport = createVVFTransport((logEntry) => {
  const events = processor.processLog(logEntry);
  events.forEach(event => {
    // Send events to your visualization
    eventEmitter.emit('graph-event', event);
  });
});

// Add transport to logger
const enhancedLogger = enhanceLogger(logger);
const loggerInstance = enhancedLogger._vvfLogger;
loggerInstance.addTransport(vvfTransport);
```

## API Reference

### `enhanceLogger<T>(logger: T, options?: EnhancedLoggerOptions): T`

Wraps an existing logger to capture source information.

**Options:**
- `projectRoot` - Project root directory for path normalization (default: `process.cwd()`)
- `captureSource` - Enable source capture (default: `true`)
- `level` - Minimum log level (default: `'info'`)
- `samplingRate` - Sample 1 out of N logs (default: `1` = all logs)

**Example:**
```typescript
const logger = enhanceLogger(winston.createLogger(), {
  projectRoot: '/path/to/project',
  level: 'debug',
  samplingRate: 1 // Capture all logs
});
```

### `createLogger(options?: EnhancedLoggerOptions): EnhancedLogger`

Creates a standalone logger with source capture enabled.

**Example:**
```typescript
const logger = createLogger({
  projectRoot: __dirname,
  level: 'info'
});

logger.debug('Debug message');
logger.info('Info message');
logger.warn('Warning message');
logger.error('Error message');
```

### `createVVFTransport(onLog: (entry: LogEntry) => void): LogTransport`

Creates a transport that forwards logs to a callback.

**Example:**
```typescript
const transport = createVVFTransport((logEntry) => {
  console.log('Log from:', logEntry.metadata.source?.file);
  console.log('Message:', logEntry.message);
});
```

### `wrapConsoleLogger(logger, options): EnhancedLogger`

Wraps a console-like logger (has debug/info/warn/error methods).

### `getEnhancedLogger(logger): EnhancedLogger | undefined`

Retrieves the EnhancedLogger instance from a wrapped logger.

## Manual Source Annotation

If automatic source capture fails, you can manually specify the source:

```typescript
logger.info('Lock acquired', {
  _vvfSource: 'lib/lock-manager.ts',
  _vvfLine: 42,
  _vvfColumn: 10
});
```

## Source Capture Details

The logger uses `Error.prepareStackTrace` to capture the caller's location:

1. Creates an Error to capture stack trace
2. Parses the stack to find the calling location
3. Normalizes the path relative to `projectRoot`
4. Filters out `node_modules` and internal Node.js files

**Performance:**
- Source capture adds <10ms overhead per log
- Uses sampling to reduce overhead in high-volume scenarios
- Can be disabled with `captureSource: false`

## Integration with VVF

This logger is designed to work seamlessly with the Visual Validation Framework:

1. **Logger** captures source paths
2. **PathBasedEventProcessor** maps logs to components
3. **GraphRenderer** visualizes component activity

See the [main documentation](../../docs/IMPLEMENTATION_MILESTONES.md) for complete integration guide.

## Examples

### Milestone 1: Basic Activity Tracking

```typescript
// vvf.config.yaml
components:
  lock-manager:
    sources:
      - "lib/lock-manager.ts"

// Your code
logger.info('Processing request'); // Triggers pulse animation on lock-manager
```

### Milestone 2: Action Pattern Matching

```typescript
// vvf.config.yaml
components:
  lock-manager:
    sources:
      - "lib/lock-manager.ts"
    actions:
      - pattern: "Lock acquired for (?<lockId>\\S+)"
        event: lock_acquired
        state: acquired

// Your code
logger.info('Lock acquired for branch-123');
// Triggers state change + metadata extraction
```

## License

MIT
