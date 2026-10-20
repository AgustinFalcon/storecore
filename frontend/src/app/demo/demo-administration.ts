import type { DemoAddress, DemoCampaign, DemoContentBlock, DemoSettings, DemoSnapshot } from './demo-model';
import { DemoModuleId } from './demo-model';
import { DemoCampaignState, DemoModuleState } from './demo-config-types';
import { validateDemoIdentity } from './demo-access';

interface CustomerPort {
  snapshot(): DemoSnapshot;
  requireCustomer(actorId: string): void;
  commit(): void;
}
/** Mutates only the authenticated customer's contact and address aggregate. */
export class DemoCustomerCommands {
  constructor(private readonly port: CustomerPort) {}
  saveProfile(actorId: string, draft: { firstName: string; lastName: string; phone: string }): void {
    this.port.requireCustomer(actorId);
    const actor = this.port.snapshot().actors.find(value => value.id === actorId)!;
    const error = validateDemoIdentity(actor.email, draft.firstName, draft.lastName, draft.phone);
    if (error) throw new Error(error);
    Object.assign(actor, { firstName: draft.firstName.trim(), lastName: draft.lastName.trim(), phone: draft.phone.trim() });
    this.port.commit();
  }
  saveAddress(actorId: string, draft: DemoAddress): void {
    this.port.requireCustomer(actorId);
    if (!draft.id || !draft.label.trim() || draft.label.length > 80 || !draft.street.trim() || draft.street.length > 160 || !draft.city.trim() || draft.city.length > 80 || !/^[A-Za-z0-9 -]{3,12}$/.test(draft.postal)) throw new Error('Dirección: completá etiqueta, calle (hasta 160 caracteres), ciudad (hasta 80) y código postal (3 a 12 letras o números).');
    const actor = this.port.snapshot().actors.find(value => value.id === actorId)!;
    const index = actor.addresses.findIndex(value => value.id === draft.id);
    if (draft.primary) actor.addresses.forEach(value => value.primary = false);
    const address = { ...draft, label: draft.label.trim(), street: draft.street.trim(), city: draft.city.trim(), primary: actor.addresses.length === 0 || draft.primary };
    if (index < 0) actor.addresses.push(address); else actor.addresses[index] = address;
    this.port.commit();
  }
  deleteAddress(actorId: string, id: string): void {
    this.port.requireCustomer(actorId);
    const actor = this.port.snapshot().actors.find(value => value.id === actorId)!;
    const wasPrimary = actor.addresses.find(value => value.id === id)?.primary;
    actor.addresses = actor.addresses.filter(value => value.id !== id);
    if (wasPrimary && actor.addresses.length) actor.addresses[0].primary = true;
    this.port.commit();
  }
  primaryAddress(actorId: string, id: string): void {
    this.port.requireCustomer(actorId);
    const actor = this.port.snapshot().actors.find(value => value.id === actorId)!;
    if (!actor.addresses.some(value => value.id === id)) throw new Error('Dirección no disponible.');
    actor.addresses.forEach(value => value.primary = value.id === id);
    this.port.commit();
  }
}
interface AdministrationPort {
  snapshot(): DemoSnapshot;
  requireAdmin(): void;
  commit(): void;
}
/** Owns publication of the home-page content, never catalog or account state. */
export class DemoContentCommands {
  constructor(private readonly port: AdministrationPort) {}
  save(title: string, subtitle: string, blocks: readonly DemoContentBlock[]): void {
    this.port.requireAdmin();
    if (!title.trim() || title.length > 120 || subtitle.length > 500 || blocks.some(block => !block.id || !block.title.trim() || block.title.length > 120 || !block.body.trim() || block.body.length > 2000) || new Set(blocks.map(block => block.id)).size !== blocks.length) throw new Error('Contenido: título hasta 120 caracteres, descripción hasta 500 y texto de bloque entre 1 y 2000 caracteres.');
    const snapshot = this.port.snapshot();
    snapshot.title = title.trim(); snapshot.subtitle = subtitle.trim();
    snapshot.blocks = blocks.map(block => ({ ...block }));
    this.port.commit();
  }
}
/** Configuration changes are explicit and cannot promote Unknown to an enabled state. */
export class DemoConfigurationCommands {
  constructor(private readonly port: AdministrationPort) {}
  toggle(id: DemoModuleId): void {
    this.port.requireAdmin();
    const module = this.port.snapshot().modules.find(value => value.id === id);
    if (!module || id === DemoModuleId.Unknown || module.state === DemoModuleState.Unknown) throw new Error('Estado de módulo desconocido.');
    module.state = module.state.next;
    this.port.commit();
  }
  save(settings: DemoSettings): void {
    this.port.requireAdmin();
    if (![settings.homepageItems, settings.lowStockThreshold, settings.deliveryDays, settings.mlRows].every(value => Number.isInteger(value) && value >= 1 && value <= 30) || !/^[A-Z0-9-]{2,12}$/.test(settings.trackingPrefix)) throw new Error('Indicá valores enteros de 1 a 30 y un prefijo de seguimiento de 2–12 letras/números.');
    this.port.snapshot().settings = { ...settings };
    this.port.commit();
  }
}
interface CampaignPort extends AdministrationPort { requireCatalog(): void; }
/** Campaign edits and quotation are separate responsibilities. */
export class DemoCampaignCommands {
  constructor(private readonly port: CampaignPort) {}
  save(campaign: DemoCampaign): void {
    this.port.requireAdmin(); this.port.requireCatalog();
    const snapshot = this.port.snapshot();
    if (campaign.state === DemoCampaignState.Unknown || snapshot.campaigns.find(value => value.id === campaign.id)?.state === DemoCampaignState.Unknown || !campaign.title.trim() || !snapshot.products.some(value => value.sku === campaign.sku) || !Number.isInteger(campaign.percent) || campaign.percent <= 0 || campaign.percent > 70 || campaign.from > campaign.until) throw new Error('Revisá el título, producto, descuento (1–70%) y vigencia.');
    const index = snapshot.campaigns.findIndex(value => value.id === campaign.id);
    if (index < 0) snapshot.campaigns.push({ ...campaign }); else snapshot.campaigns[index] = { ...campaign };
    this.port.commit();
  }
}
export class DemoCampaignQuote {
  constructor(private readonly snapshot: () => DemoSnapshot, private readonly now: () => string) {}
  amount(sku: string, price: number): number {
    const day = this.now().slice(0, 10);
    const offer = this.snapshot().campaigns.find(value => value.sku === sku && value.state.active && value.from <= day && value.until >= day);
    return offer ? Math.round(price * (100 - offer.percent) / 100) : price;
  }
}
