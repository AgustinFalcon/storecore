export interface OrderMilestone {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly state: 'done' | 'current' | 'upcoming';
}
