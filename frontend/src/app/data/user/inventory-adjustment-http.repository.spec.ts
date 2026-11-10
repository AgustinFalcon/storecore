import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { ConfirmInventoryAdjustmentStep, InventoryAdjustmentOutcome } from '../../domain/user/inventory-adjustment';
import { InventoryAdjustmentHttpRepository } from './inventory-adjustment-http.repository';
describe('InventoryAdjustmentHttpRepository', () => {
  it('uses a dedicated frozen delta payload and translates durable HTTP rejections', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), InventoryAdjustmentHttpRepository] });
    const repository = TestBed.inject(InventoryAdjustmentHttpRepository); const http = TestBed.inject(HttpTestingController);
    const command = new ConfirmInventoryAdjustmentStep().execute('42', { available: 8, reserved: 3, safety: 2 }, '-2', ' Conteo ', '12345678-1234-4234-8234-123456789012')!;
    let outcome = InventoryAdjustmentOutcome.Unknown; repository.submit(command).subscribe(value => outcome = value.outcome);
    const request = http.expectOne(`${environment.apiBaseUrl}/user/inventory/42/adjustments`);
    expect(request.request.body).toEqual({ commandId: command.commandId, quantityDelta: -2, expected: command.expected, reason: 'Conteo' });
    request.flush({ code: 409, data: { commandId: command.commandId, variantId: '42', state: 'REJECTED', reason: 'BALANCE_CHANGED', recordedAt: '2026-11-10T00:00:00Z' } }, { status: 409, statusText: 'Conflict' });
    expect(outcome).toBe(InventoryAdjustmentOutcome.Rejected); http.verify();
  });
});
