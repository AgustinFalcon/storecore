import type { DemoProduct, DemoProductWriter } from './catalog-model';
import { ProductPublication } from './catalog-types';
import { DemoProductPolicy } from './product-policy';

export class SaveDemoProductCommand {
  private readonly proposal: DemoProduct;
  constructor(private readonly actorId: string, product: DemoProduct, private readonly editingSku: string | undefined, private readonly expectedRevision: number) { this.proposal = DemoProductPolicy.clone(product); }
  execute(commerce: DemoProductWriter): void { commerce.saveProduct(this.actorId, this.proposal, this.editingSku, this.expectedRevision); }
}
export class ChangeDemoProductPublicationCommand {
  readonly confirmation: string;
  private readonly proposal: DemoProduct;
  constructor(private readonly actorId: string, product: DemoProduct, private readonly expectedRevision: number) {
    this.confirmation = product.publication.confirmation;
    this.proposal = { ...DemoProductPolicy.clone(product), publication: product.publication.next() };
  }
  execute(commerce: DemoProductWriter): void {
    if (this.proposal.publication === ProductPublication.Unknown) throw new Error('El estado desconocido no permite publicar ni archivar.');
    commerce.saveProduct(this.actorId, this.proposal, this.proposal.sku, this.expectedRevision);
  }
}
