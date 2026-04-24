export class SuggestModal<T> {
  app: unknown;
  emptyStateText = "";
  constructor(app: unknown) {
    this.app = app;
  }
  setPlaceholder(_text: string) {}
}

export class Notice {
  constructor(_msg: string) {}
}

export class App {}
