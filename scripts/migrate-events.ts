#!/usr/bin/env node
/**
 * Migration script: events Record → single event per node
 *
 * Converts nodes with multiple events to separate nodes with single event.
 * Also adds pv.otel metadata if missing for .otel.canvas files.
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { resolve, join } from 'path';

interface OldNode {
  id: string;
  type: string;
  text?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  pv?: {
    nodeType?: string;
    name?: string;
    description?: string;
    shape?: string;
    fill?: string;
    stroke?: string;
    icon?: string;
    sources?: string[];
    events?: Record<string, {
      description: string;
      attributes: Record<string, any>;
    }>;
    otel?: {
      kind?: string;
      category?: string;
      isNew?: boolean;
    };
    [key: string]: any;
  };
  [key: string]: any;
}

interface NewNode extends Omit<OldNode, 'pv'> {
  pv?: {
    nodeType?: string;
    name?: string;
    description?: string;
    shape?: string;
    fill?: string;
    stroke?: string;
    icon?: string;
    sources?: string[];
    event?: {
      name: string;
      description: string;
      attributes: Record<string, any>;
    };
    otel?: {
      kind: string;
      category: string;
      isNew: boolean;
    };
    [key: string]: any;
  };
}

interface Edge {
  id: string;
  fromNode: string;
  toNode: string;
  [key: string]: any;
}

interface Canvas {
  nodes: OldNode[];
  edges?: Edge[];
  pv?: any;
}

function migrateCanvas(filePath: string): void {
  console.log(`\n📄 Migrating: ${filePath}`);

  const content = readFileSync(filePath, 'utf-8');
  const canvas: Canvas = JSON.parse(content);

  const newNodes: NewNode[] = [];
  const nodeIdMapping: Map<string, string[]> = new Map(); // old id -> new ids
  let nodeCount = 0;
  let splitCount = 0;

  // Process each node
  for (const node of canvas.nodes) {
    // Convert anchors to pv.sources if present
    let sources: string[] | undefined;
    if ((node as any).anchors && Array.isArray((node as any).anchors)) {
      sources = (node as any).anchors.map((a: any) => a.path || a);
      delete (node as any).anchors;
    }

    if (!node.pv?.events || Object.keys(node.pv.events).length === 0) {
      // No events - keep as is but add sources if present
      const newNode = node as NewNode;
      if (sources && newNode.pv) {
        newNode.pv.sources = sources;
      }
      newNodes.push(newNode);
      nodeIdMapping.set(node.id, [node.id]);
      nodeCount++;
      continue;
    }

    const events = Object.entries(node.pv.events);

    if (events.length === 1) {
      // Single event - convert format
      const [eventName, eventSchema] = events[0];
      const { events: _, ...restPv } = node.pv;
      const newNode: NewNode = {
        ...node,
        pv: {
          ...restPv,
          ...(sources ? { sources } : {}),
          event: {
            name: eventName,
            description: eventSchema.description,
            attributes: eventSchema.attributes,
          },
        },
      };

      // Add pv.otel if missing for .otel.canvas files
      if (filePath.endsWith('.otel.canvas') && !newNode.pv!.otel) {
        newNode.pv!.otel = {
          kind: 'event',
          category: inferCategory(eventName),
          isNew: true,
        };
      }

      newNodes.push(newNode);
      nodeIdMapping.set(node.id, [node.id]);
      nodeCount++;
    } else {
      // Multiple events - split into separate nodes
      console.log(`  🔀 Splitting node "${node.id}" with ${events.length} events`);
      splitCount++;

      const newNodeIds: string[] = [];
      const VERTICAL_SPACING = 150;

      events.forEach(([eventName, eventSchema], index) => {
        const newId = index === 0 ? node.id : `${node.id}-${index + 1}`;
        newNodeIds.push(newId);

        const { events: _, ...restPv } = node.pv;
        const newNode: NewNode = {
          ...node,
          id: newId,
          // Arrange vertically below original position
          y: node.y + (index * VERTICAL_SPACING),
          text: node.text ? `${node.text}\n\n**Event:** ${eventName}` : eventName,
          pv: {
            ...restPv,
            ...(sources ? { sources } : {}),
            name: restPv.name || eventName,
            description: eventSchema.description,
            event: {
              name: eventName,
              description: eventSchema.description,
              attributes: eventSchema.attributes,
            },
          },
        };

        // Add pv.otel if missing for .otel.canvas files
        if (filePath.endsWith('.otel.canvas') && !newNode.pv!.otel) {
          newNode.pv!.otel = {
            kind: 'event',
            category: inferCategory(eventName),
            isNew: true,
          };
        }

        newNodes.push(newNode);
        console.log(`    ➜ Created: ${newId} (${eventName})`);
      });

      nodeIdMapping.set(node.id, newNodeIds);
      nodeCount += newNodeIds.length;
    }
  }

  // Update edges to point to new node IDs (point to first split node)
  const newEdges: Edge[] = [];
  if (canvas.edges) {
    for (const edge of canvas.edges) {
      const fromIds = nodeIdMapping.get(edge.fromNode);
      const toIds = nodeIdMapping.get(edge.toNode);

      if (!fromIds || !toIds) {
        console.warn(`    ⚠️  Edge ${edge.id} references unknown node`);
        newEdges.push(edge);
        continue;
      }

      // Use first node from split nodes
      newEdges.push({
        ...edge,
        fromNode: fromIds[0],
        toNode: toIds[0],
      });
    }
  }

  // Write migrated canvas
  const migratedCanvas = {
    ...canvas,
    nodes: newNodes,
    edges: newEdges,
  };

  writeFileSync(filePath, JSON.stringify(migratedCanvas, null, 2) + '\n', 'utf-8');

  console.log(`  ✅ Migrated: ${nodeCount} nodes (${splitCount} split)`);
}

function inferCategory(eventName: string): string {
  const name = eventName.toLowerCase();

  if (name.includes('start') || name.includes('begin') || name.includes('init')) {
    return 'lifecycle';
  }
  if (name.includes('complete') || name.includes('finish') || name.includes('done') || name.includes('success')) {
    return 'lifecycle';
  }
  if (name.includes('error') || name.includes('fail')) {
    return 'error';
  }
  if (name.includes('cache')) {
    return 'cache';
  }
  if (name.includes('build') || name.includes('process')) {
    return 'build';
  }
  if (name.includes('discover') || name.includes('detect')) {
    return 'discovery';
  }
  if (name.includes('install')) {
    return 'installation';
  }

  return 'operation';
}

// Main
function findCanvasFiles(): string[] {
  const files: string[] = [];

  // Root .principal-views
  const rootDir = '.principal-views';
  try {
    const rootFiles = readdirSync(rootDir);
    for (const file of rootFiles) {
      if (file.endsWith('.otel.canvas')) {
        files.push(join(rootDir, file));
      }
    }
  } catch (e) {
    // Directory doesn't exist
  }

  // Packages
  try {
    const packagesDir = 'packages';
    const packages = readdirSync(packagesDir);
    for (const pkg of packages) {
      const pvDir = join(packagesDir, pkg, '.principal-views');
      try {
        const pvFiles = readdirSync(pvDir);
        for (const file of pvFiles) {
          if (file.endsWith('.otel.canvas')) {
            files.push(join(pvDir, file));
          }
        }
      } catch (e) {
        // Directory doesn't exist
      }
    }
  } catch (e) {
    // Packages directory doesn't exist
  }

  return files;
}

const canvasFiles = findCanvasFiles();

if (canvasFiles.length === 0) {
  console.log('No .otel.canvas files found');
  process.exit(0);
}

console.log(`Found ${canvasFiles.length} .otel.canvas files\n`);

for (const file of canvasFiles) {
  try {
    migrateCanvas(resolve(file));
  } catch (error) {
    console.error(`❌ Error migrating ${file}:`, error);
    process.exit(1);
  }
}

console.log('\n✅ Migration complete!');
