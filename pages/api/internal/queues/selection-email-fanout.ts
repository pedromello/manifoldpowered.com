import {
  selectionEmailQueue,
  selectionEmailQueueId,
  selectionEmailQueueRetry,
  safelyProcessSelectionEmail,
} from "infra/selection-email-queue";
import { processSelectionEmailEvent } from "models/selection_email";

export default selectionEmailQueue.handleNodeCallback(
  async (message) => {
    await safelyProcessSelectionEmail(() =>
      processSelectionEmailEvent(selectionEmailQueueId(message, "eventId")),
    );
  },
  { retry: selectionEmailQueueRetry },
);
