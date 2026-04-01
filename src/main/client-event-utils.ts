import type { ClientEvent } from '../renderer/types';

export function eventRequiresSessionManager(event: ClientEvent): boolean {
  switch (event.type) {
    case 'session.start':
    case 'session.continue':
    case 'session.stop':
    case 'session.delete':
    case 'session.batchDelete':
    case 'session.list':
    case 'session.getMessages':
    case 'session.getTraceSteps':
    case 'permission.response':
      return true;
    case 'memory.add':
    case 'memory.search':
    case 'memory.list':
    default:
      return false;
  }
}
