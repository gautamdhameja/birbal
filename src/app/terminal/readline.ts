import { createInterface as createNodeReadlineInterface } from "node:readline";

import type {
  ReadlineTerminalInputOptions,
  TerminalInputOutcome,
  TerminalInputPort,
  TerminalInputTerminalOutcome,
} from "./types.js";

type PendingRead = {
  resolve: (outcome: TerminalInputOutcome) => void;
};

function normalizeInputError(value: unknown): Error {
  return value instanceof Error ? value : new Error("Terminal input failed.", { cause: value });
}

export function createReadlineTerminalInput({
  input,
  interactionOutput,
  maxQueuedCharacters,
  interruptSignalSource = process,
  createInterface = createNodeReadlineInterface,
}: ReadlineTerminalInputOptions): TerminalInputPort {
  if (!Number.isSafeInteger(maxQueuedCharacters) || maxQueuedCharacters <= 0) {
    throw new RangeError("Terminal input queue limit must be a positive safe integer.");
  }

  const lines: string[] = [];
  let lineHead = 0;
  let queuedCharacters = 0;
  let pendingRead: PendingRead | undefined;
  let terminalOutcome: TerminalInputTerminalOutcome | undefined;
  let readlineListenersAttached = true;
  let interruptListenerAttached = true;
  let closeInvoked = false;

  const readlineInterface = createInterface({
    input,
    output: interactionOutput,
    terminal: input.isTTY === true && interactionOutput.isTTY === true,
  });

  const detachReadlineListeners = (): void => {
    if (!readlineListenersAttached) {
      return;
    }
    readlineListenersAttached = false;
    readlineInterface.off("line", handleLine);
    readlineInterface.off("close", handleClose);
    readlineInterface.off("SIGINT", handleInterrupt);
    readlineInterface.off("error", handleInputError);
  };

  const detachInterruptListener = (): void => {
    if (!interruptListenerAttached) {
      return;
    }
    interruptListenerAttached = false;
    interruptSignalSource.off("SIGINT", handleInterrupt);
  };

  const detachListeners = (): void => {
    detachReadlineListeners();
    detachInterruptListener();
  };

  const clearLines = (): void => {
    lines.length = 0;
    lineHead = 0;
    queuedCharacters = 0;
  };

  const dequeueLine = (): string | undefined => {
    if (lineHead >= lines.length) {
      return undefined;
    }

    const line = lines[lineHead]!;
    lineHead += 1;
    queuedCharacters -= line.length + 1;

    if (lineHead === lines.length) {
      clearLines();
    } else if (lineHead >= 64 && lineHead * 2 >= lines.length) {
      lines.splice(0, lineHead);
      lineHead = 0;
    }

    return line;
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

    const line = dequeueLine();
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
    const upgradesEof = terminalOutcome?.type === "eof" && outcome.type === "interrupted";
    if (terminalOutcome && !upgradesEof) {
      return false;
    }
    terminalOutcome = outcome;
    if (options.discardLines) {
      clearLines();
    }
    detachReadlineListeners();
    if (outcome.type !== "eof") {
      detachInterruptListener();
    }
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

    const nextQueuedCharacters = queuedCharacters + line.length + 1;
    if (nextQueuedCharacters > maxQueuedCharacters) {
      if (
        latchTerminalOutcome(
          {
            type: "input_error",
            error: new Error(
              `Terminal input queue exceeded its ${maxQueuedCharacters} character limit.`,
            ),
          },
          { discardLines: true },
        )
      ) {
        closeReadlineInterface();
      }
      return;
    }

    lines.push(line);
    queuedCharacters = nextQueuedCharacters;
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
  readlineInterface.on("error", handleInputError);
  interruptSignalSource.on("SIGINT", handleInterrupt);

  return {
    read(): Promise<TerminalInputOutcome> {
      if (terminalOutcome?.type === "interrupted" || terminalOutcome?.type === "input_error") {
        return Promise.resolve(terminalOutcome);
      }

      const line = dequeueLine();
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

    discardBufferedLines(): void {
      clearLines();
    },

    close(): void {
      latchTerminalOutcome({ type: "eof" }, { discardLines: true });
      detachListeners();
      closeReadlineInterface();
    },
  };
}
