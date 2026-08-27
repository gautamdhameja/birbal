import {
  createInterface as createNodeReadlineInterface,
  type ReadLineOptions,
} from "node:readline";

import type {
  TerminalInputOutcome,
  TerminalInputPort,
  TerminalInputTerminalOutcome,
} from "./types.js";

type TtyReadableStream = NodeJS.ReadableStream & {
  isTTY?: boolean;
};

type TtyWritableStream = NodeJS.WritableStream & {
  isTTY?: boolean;
};

export type ReadlineInterfaceLike = {
  on(event: "line", listener: (line: string) => void): unknown;
  on(event: "close" | "SIGINT", listener: () => void): unknown;
  off(event: "line", listener: (line: string) => void): unknown;
  off(event: "close" | "SIGINT", listener: () => void): unknown;
  close(): void;
};

export type ReadlineInterfaceFactory = (options: ReadLineOptions) => ReadlineInterfaceLike;

export type ReadlineTerminalInputOptions = {
  input: TtyReadableStream;
  interactionOutput: TtyWritableStream;
  createInterface?: ReadlineInterfaceFactory;
};

type PendingRead = {
  resolve: (outcome: TerminalInputOutcome) => void;
};

function normalizeInputError(value: unknown): Error {
  return value instanceof Error ? value : new Error("Terminal input failed.", { cause: value });
}

export function createReadlineTerminalInput({
  input,
  interactionOutput,
  createInterface = createNodeReadlineInterface,
}: ReadlineTerminalInputOptions): TerminalInputPort {
  const lines: string[] = [];
  let pendingRead: PendingRead | undefined;
  let terminalOutcome: TerminalInputTerminalOutcome | undefined;
  let listenersAttached = true;
  let closeInvoked = false;

  const readlineInterface = createInterface({
    input,
    output: interactionOutput,
    terminal: input.isTTY === true && interactionOutput.isTTY === true,
  });

  const detachListeners = (): void => {
    if (!listenersAttached) {
      return;
    }
    listenersAttached = false;
    readlineInterface.off("line", handleLine);
    readlineInterface.off("close", handleClose);
    readlineInterface.off("SIGINT", handleInterrupt);
    input.off("error", handleInputError);
  };

  const settlePendingRead = (): void => {
    if (!pendingRead) {
      return;
    }

    if (terminalOutcome?.type === "interrupted" || terminalOutcome?.type === "input_error") {
      const { resolve } = pendingRead;
      pendingRead = undefined;
      resolve(terminalOutcome);
      return;
    }

    const line = lines.shift();
    if (line !== undefined) {
      const { resolve } = pendingRead;
      pendingRead = undefined;
      resolve({ type: "line", line });
      return;
    }

    if (terminalOutcome) {
      const { resolve } = pendingRead;
      pendingRead = undefined;
      resolve(terminalOutcome);
    }
  };

  const latchTerminalOutcome = (
    outcome: TerminalInputTerminalOutcome,
    options: { discardLines: boolean },
  ): boolean => {
    if (terminalOutcome) {
      return false;
    }
    terminalOutcome = outcome;
    if (options.discardLines) {
      lines.length = 0;
    }
    detachListeners();
    settlePendingRead();
    return true;
  };

  const closeReadlineInterface = (): void => {
    if (closeInvoked) {
      return;
    }
    closeInvoked = true;
    readlineInterface.close();
  };

  function handleLine(line: string): void {
    if (terminalOutcome) {
      return;
    }
    lines.push(line);
    settlePendingRead();
  }

  function handleClose(): void {
    closeInvoked = true;
    latchTerminalOutcome({ type: "eof" }, { discardLines: false });
  }

  function handleInterrupt(): void {
    if (
      latchTerminalOutcome(
        { type: "interrupted" },
        {
          discardLines: true,
        },
      )
    ) {
      closeReadlineInterface();
    }
  }

  function handleInputError(value: unknown): void {
    if (
      latchTerminalOutcome(
        { type: "input_error", error: normalizeInputError(value) },
        { discardLines: true },
      )
    ) {
      closeReadlineInterface();
    }
  }

  readlineInterface.on("line", handleLine);
  readlineInterface.on("close", handleClose);
  readlineInterface.on("SIGINT", handleInterrupt);
  input.on("error", handleInputError);

  return {
    read(): Promise<TerminalInputOutcome> {
      if (terminalOutcome?.type === "interrupted" || terminalOutcome?.type === "input_error") {
        return Promise.resolve(terminalOutcome);
      }

      const line = lines.shift();
      if (line !== undefined) {
        return Promise.resolve({ type: "line", line });
      }

      if (terminalOutcome) {
        return Promise.resolve(terminalOutcome);
      }

      if (pendingRead) {
        return Promise.reject(new Error("Only one terminal input read may be pending."));
      }

      return new Promise((resolve) => {
        pendingRead = { resolve };
      });
    },

    getTerminalOutcome(): TerminalInputTerminalOutcome | undefined {
      return terminalOutcome;
    },

    close(): void {
      latchTerminalOutcome({ type: "eof" }, { discardLines: true });
      detachListeners();
      closeReadlineInterface();
    },
  };
}
