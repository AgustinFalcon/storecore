export interface HomeBlock {
  readonly id: string;
  readonly title: string;
  readonly body: string;
}

export interface HomeContent {
  readonly title: string;
  readonly blocks: readonly HomeBlock[];
}
