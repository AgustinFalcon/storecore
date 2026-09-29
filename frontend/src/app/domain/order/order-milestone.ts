export class MilestonePaint {
  private constructor(readonly code: string) {}

  static readonly Done = new MilestonePaint('done');
  static readonly Current = new MilestonePaint('current');
  static readonly Upcoming = new MilestonePaint('upcoming');
}

export interface OrderMilestone {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly state: MilestonePaint;
}
