import { NextResponse } from "next/server";

type SubmittedFile = {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string;
};

type SubmitPayload = {
  context: string;
  driveFolderId: string;
  files: SubmittedFile[];
};

type WebhookResponseBody = {
  ok?: boolean;
  message?: string;
  error?: string;
  [key: string]: unknown;
};

function isValidPayload(payload: unknown): payload is SubmitPayload {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const typed = payload as Partial<SubmitPayload>;
  if (typeof typed.context !== "string" || !typed.context.trim()) {
    return false;
  }
  if (typeof typed.driveFolderId !== "string" || !typed.driveFolderId.trim()) {
    return false;
  }
  if (!Array.isArray(typed.files) || typed.files.length === 0) {
    return false;
  }

  return typed.files.every((file) => {
    if (!file || typeof file !== "object") {
      return false;
    }
    const typedFile = file as Partial<SubmittedFile>;
    return (
      typeof typedFile.id === "string" &&
      typeof typedFile.name === "string" &&
      typeof typedFile.mimeType === "string" &&
      typeof typedFile.webViewLink === "string"
    );
  });
}

export async function POST(request: Request) {
  const webhookUrl = process.env.MAKE_WEBHOOK_URL;
  if (!webhookUrl) {
    return NextResponse.json(
      { ok: false, message: "MAKE_WEBHOOK_URL is not configured." },
      { status: 500 }
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: "Invalid JSON body." },
      { status: 400 }
    );
  }

  if (!isValidPayload(payload)) {
    return NextResponse.json(
      {
        ok: false,
        message: "Invalid payload. Expected context, driveFolderId, and files.",
      },
      { status: 400 }
    );
  }

  try {
    // Server-side forward to avoid browser CORS and keep webhook URL private.
    const makeResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const responseText = await makeResponse.text();
    let makeBody: WebhookResponseBody | null = null;

    try {
      makeBody = responseText ? (JSON.parse(responseText) as WebhookResponseBody) : null;
    } catch {
      makeBody = null;
    }

    const messageFromMake =
      (makeBody && typeof makeBody.message === "string" && makeBody.message) ||
      (makeBody && typeof makeBody.error === "string" && makeBody.error) ||
      responseText ||
      (makeResponse.ok
        ? "Submitted successfully."
        : "Make webhook returned an error.");

    return NextResponse.json(
      {
        ok: makeResponse.ok,
        message: messageFromMake,
        makeStatus: makeResponse.status,
        makeBody,
      },
      { status: makeResponse.status }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown forwarding error.";
    return NextResponse.json(
      {
        ok: false,
        message: "Could not reach Make webhook.",
        details: message,
      },
      { status: 502 }
    );
  }
}
