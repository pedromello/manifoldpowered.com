import {
  selectionEmailQueue,
  selectionEmailQueueId,
  selectionEmailQueueRetry,
  safelyProcessSelectionEmail,
} from "infra/selection-email-queue";
import { processSelectionEmailBatch } from "models/selection_email";

export default selectionEmailQueue.handleNodeCallback(
  async (message) => {
    await safelyProcessSelectionEmail(() =>
      processSelectionEmailBatch(selectionEmailQueueId(message, "batchId")),
    );
  },
  { retry: selectionEmailQueueRetry },
);
