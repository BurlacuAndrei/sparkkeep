# Goal: Telegram Ingestion Acknowledgment & Send-and-Edit Pattern

## Context
When a user shares a large article or YouTube video with the Sparkkeep Telegram bot, processing (downloading, transcribing, LLM analysis) can take 10-30 seconds. Currently, the bot stays silent during this time, leaving the user wondering if the message was received. Furthermore, when the analysis completes, the bot sends a brand new message, which can clutter the chat history.

## Requirements
1. **Immediate Acknowledgment:** When `handleMessage` receives a valid share, immediately call `sendChatAction(typing)` and send a temporary placeholder message: `📥 Processing [Link/Title]...`.
2. **State Tracking:** Capture the `message_id` of this placeholder message.
3. **Send & Edit:** Modify the notification flow (`Notify` in `telegram.Adapter` or `core.CaptureShare`) so that when the card is successfully created, the bot uses `editMessageText` to replace the temporary "Processing" message with the final Triage Card and inline buttons, rather than sending a new message.
4. **Error Handling:** If analysis fails, edit the placeholder message to show the "Analysis Failed" card with a Retry button.

## Testability
- Update `internal/channel/telegram/telegram_test.go` to assert that an incoming share triggers exactly one `sendMessage` (the placeholder) followed by one `editMessageText` (the final card). 
- Verify the chat history does not end up with duplicate or orphan "Processing..." messages if an error occurs.
