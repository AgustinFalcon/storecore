import { DamageReason, DispositionDraftLine, DispositionPhase, RejectionReason, ReturnDisposition, ReturnDispositionState } from '../../domain/order/return-disposition';
import { ReturnDispositionViewState } from '../../features/admin/return-disposition.store';

const model: ReturnDisposition = { orderId: '1', returnId: '2', state: ReturnDispositionState.Editable, confirmedAt: null, lines: [
  { returnItemId: '11', orderItemId: '21', sku: 'DEMO-RMA-01', name: 'Taladro inalámbrico · kit con batería', quantity: 2, classification: null },
  { returnItemId: '12', orderItemId: '22', sku: 'DEMO-RMA-02', name: 'Juego de puntas de precisión', quantity: 1, classification: null },
] };
const mixed: readonly DispositionDraftLine[] = [
  { returnItemId: '11', restockQuantity: 1, damagedQuantity: 1, rejectedQuantity: 0, damageReason: DamageReason.Cosmetic, rejectionReason: null, observation: 'Marca visible en la carcasa.' },
  { returnItemId: '12', restockQuantity: 1, damagedQuantity: 0, rejectedQuantity: 0, damageReason: null, rejectionReason: null, observation: '' },
];
const ready = (phase: DispositionPhase, draft = mixed): ReturnDispositionViewState => ({ phase, model, draft, message: '' });

/** Visual-only examples remain in the dedicated DEMO lane. */
export const returnDispositionVisualExamples: readonly { readonly label: string; readonly state: ReturnDispositionViewState }[] = [
  { label: 'Clasificación mixta', state: ready(DispositionPhase.Editing) },
  { label: 'Revisión del impacto', state: ready(DispositionPhase.Reviewing) },
  { label: 'Todo dañado', state: ready(DispositionPhase.Editing, model.lines.map(line => ({ returnItemId: line.returnItemId, restockQuantity: 0, damagedQuantity: line.quantity, rejectedQuantity: 0, damageReason: DamageReason.Functional, rejectionReason: null, observation: '' }))) },
  { label: 'Todo rechazado', state: ready(DispositionPhase.Editing, model.lines.map(line => ({ returnItemId: line.returnItemId, restockQuantity: 0, damagedQuantity: 0, rejectedQuantity: line.quantity, damageReason: null, rejectionReason: RejectionReason.SerialMismatch, observation: '' }))) },
  { label: 'Confirmación', state: ready(DispositionPhase.Confirming) },
  { label: 'Confirmado', state: { ...ready(DispositionPhase.Confirmed, []), model: { ...model, state: ReturnDispositionState.Confirmed, confirmedAt: '2026-11-09T15:00:00Z', lines: model.lines.map(line => ({ ...line, classification: mixed.find(item => item.returnItemId === line.returnItemId) ?? null })) } } },
  { label: 'Histórico incompleto', state: { ...ready(DispositionPhase.ReadOnly, []), model: { ...model, state: ReturnDispositionState.HistoricalIncomplete }, message: 'Histórico sin detalle de inspección. No se infieren cantidades repuestas.' } },
  { label: 'Acceso denegado', state: { phase: DispositionPhase.AccessDenied, model: null, draft: [], message: 'No tenés acceso a esta inspección.' } },
  { label: 'Cargando', state: { phase: DispositionPhase.Loading, model: null, draft: [], message: '' } },
  { label: 'Conflicto', state: { ...ready(DispositionPhase.Conflict, []), message: 'La devolución cambió. Consultá el resultado actual.' } },
  { label: 'Respuesta incierta', state: { ...ready(DispositionPhase.Uncertain, []), message: 'La confirmación puede haberse registrado. Consultá el resultado antes de continuar.' } },
  { label: 'Error de consulta', state: { phase: DispositionPhase.Failed, model: null, draft: [], message: 'No pudimos consultar la devolución.' } },
];
