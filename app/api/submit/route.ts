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
      { error: "MAKE_WEBHOOK_URL is not configured." },
      { status: 500 }
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!isValidPayload(payload)) {
    return NextResponse.json(
      { error: "Invalid payload. Expected context, driveFolderId, and files." },
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

    if (!makeResponse.ok) {
      const makeBody = await makeResponse.text();
      return NextResponse.json(
        {
          error: "Failed to forward request to Make.",
          makeStatus: makeResponse.status,
          makeBody,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, makeStatus: makeResponse.status });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown forwarding error.";
    return NextResponse.json(
      {
        error: "Could not reach Make webhook.",
        details: message,
      },
      { status: 502 }
    );
  }
}
