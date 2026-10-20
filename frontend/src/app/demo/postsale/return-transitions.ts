import { DemoReturnDisposition, DemoReturnInspectionResult, DemoReturnStatus, type DemoReturnRequest } from './postsale-types';

export class DemoReturnDecision {
  apply(request: DemoReturnRequest, approve: boolean, reason: string): boolean {
    const target = approve ? DemoReturnStatus.Approved : DemoReturnStatus.Rejected;
    if (request.status === target && request.decisionReason === reason.trim()) return false;
    if (request.status !== DemoReturnStatus.Requested || !reason.trim()) throw new Error('La solicitud pendiente requiere un motivo de decisión.');
    request.status = target;
    request.decisionReason = reason.trim();
    return true;
  }
}
export class DemoReturnReception {
  apply(request: DemoReturnRequest): boolean {
    if (request.status === DemoReturnStatus.Received) return false;
    if (request.status !== DemoReturnStatus.Approved) throw new Error('Solo una devolución aprobada puede recibirse.');
    request.status = DemoReturnStatus.Received;
    return true;
  }
}
export class DemoReturnInspection {
  apply(request: DemoReturnRequest, notes: string, result: DemoReturnInspectionResult): boolean {
    if (request.status === DemoReturnStatus.Inspected && request.inspectionNotes === notes.trim() && request.inspectionResult === result) return false;
    if (request.status !== DemoReturnStatus.Received || !notes.trim() || !DemoReturnInspectionResult.all.includes(result)) throw new Error('La devolución recibida requiere notas y un resultado de inspección válido.');
    request.status = DemoReturnStatus.Inspected;
    request.inspectionNotes = notes.trim();
    request.inspectionResult = result;
    return true;
  }
}

export class DemoReturnDisposal {
  apply(request: DemoReturnRequest, dispositions: ReadonlyMap<string, DemoReturnDisposition>): boolean {
    const valid = dispositions.size === request.lines.length && request.lines.every(line => DemoReturnDisposition.all.includes(dispositions.get(line.variantId) ?? DemoReturnDisposition.Unknown));
    if (!valid) throw new Error('Elegí una disposición válida para cada producto inspeccionado.');
    if (request.status === DemoReturnStatus.Disposed || request.status === DemoReturnStatus.Refunded) {
      if (request.lines.every(line => line.disposition === dispositions.get(line.variantId))) return false;
      throw new Error('La disposición ya fue registrada.');
    }
    if (request.status !== DemoReturnStatus.Inspected) throw new Error('La devolución debe estar inspeccionada antes de disponer inventario.');
    request.lines.forEach(line => line.disposition = dispositions.get(line.variantId)!);
    request.status = DemoReturnStatus.Disposed;
    return true;
  }
}
