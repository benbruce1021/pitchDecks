# Pitch Deck Intake (Next.js + Google Drive + Make.com)

This app lets users:
1. Upload multiple product files (PDF, DOCX, PPTX, PNG, JPG).
2. Enter required context for a pitch deck.
3. Authenticate with Google and upload files to Google Drive using resumable uploads.
4. Send only Drive file metadata plus context to a local API route, which forwards to Make.com server-to-server.

## 1) Create Google OAuth Client ID (Web app)

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create/select a project.
3. Enable **Google Drive API**:
   - APIs & Services -> Library -> Google Drive API -> Enable
4. Configure OAuth consent screen if not already configured.
5. Create credentials:
   - APIs & Services -> Credentials -> Create Credentials -> OAuth client ID
   - Application type: **Web application**
6. Add authorized JavaScript origins for local development, for example:
   - `http://localhost:3000`
7. Copy the generated Client ID.

## 2) Environment variables

Create `.env.local` in the project root and paste:

```env
NEXT_PUBLIC_GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID
NEXT_PUBLIC_DRIVE_FOLDER_ID=1kDPdqI7YJIEjBbQGLYJAHfmuF36OxdPS
MAKE_WEBHOOK_URL=https://hook.us2.make.com/kusymkr7131j7iurf6ntn70ea6sjbafl
```

- `NEXT_PUBLIC_GOOGLE_CLIENT_ID`: from Google Cloud OAuth credentials.
- `NEXT_PUBLIC_DRIVE_FOLDER_ID`: target Drive folder for uploads.
- `MAKE_WEBHOOK_URL`: used only on the server in `/app/api/submit/route.ts`.

## 3) Run locally

```bash
npm install
npm run dev
```

App runs at `http://localhost:3000`.

## 4) Payload sent to Make.com

The browser sends payload to local `POST /api/submit` after all uploads succeed.
That API route forwards the same JSON to `MAKE_WEBHOOK_URL`:

```json
{
  "context": "Context text from textarea",
  "driveFolderId": "1kDPdqI7YJIEjBbQGLYJAHfmuF36OxdPS",
  "files": [
    {
      "id": "drive_file_id",
      "name": "file.pdf",
      "mimeType": "application/pdf",
      "webViewLink": "https://drive.google.com/file/d/.../view"
    }
  ]
}
```

Important: file binaries are uploaded directly to Google Drive and are **not** sent to Make.com.
