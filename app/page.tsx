"use client";

import Script from "next/script";
import { ChangeEvent, FormEvent, useMemo, useRef, useState } from "react";
import {
  DriveFileMetadata,
  requestGoogleAccessToken,
  uploadFileToDriveResumable,
} from "../lib/googleDrive";

type UploadProgressMap = Record<string, number>;
type SubmitApiResponse = {
  ok?: boolean;
  message?: string;
  error?: string;
  makeStatus?: number;
};

const ACCEPTED_FILE_TYPES =
  ".pdf,.docx,.pptx,.png,.jpg,.jpeg,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation,image/png,image/jpeg";

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
const DRIVE_FOLDER_ID =
  process.env.NEXT_PUBLIC_DRIVE_FOLDER_ID ||
  "1kDPdqI7YJIEjBbQGLYJAHfmuF36OxdPS";

function fileKey(file: File, index: number): string {
  return `${index}-${file.name}-${file.size}`;
}

export default function HomePage() {
  const [files, setFiles] = useState<File[]>([]);
  const [context, setContext] = useState("");
  const [status, setStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [gisLoaded, setGisLoaded] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [progressByFile, setProgressByFile] = useState<UploadProgressMap>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const envError = useMemo(() => {
    if (!GOOGLE_CLIENT_ID) {
      return "Missing NEXT_PUBLIC_GOOGLE_CLIENT_ID.";
    }
    if (!DRIVE_FOLDER_ID) {
      return "Missing NEXT_PUBLIC_DRIVE_FOLDER_ID.";
    }
    return "";
  }, []);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files ?? []);
    setFiles(selectedFiles);
    setProgressByFile({});
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (envError) {
      setStatus(`Error: ${envError}`);
      return;
    }

    if (!context.trim()) {
      setStatus("Error: Context for the pitch deck is required.");
      return;
    }

    if (files.length === 0) {
      setStatus("Error: At least one file is required.");
      return;
    }

    if (!gisLoaded) {
      setStatus("Error: Google authentication library is still loading.");
      return;
    }

    setIsSubmitting(true);
    setStatus("Request accepted (202) - Processing your pitch deck...");

    try {
      const token =
        accessToken ??
        (await requestGoogleAccessToken(
          GOOGLE_CLIENT_ID,
          accessToken ? "" : "consent"
        ));

      if (!accessToken) {
        setAccessToken(token);
      }

      setStatus("Uploading files...");

      const metadataResults: DriveFileMetadata[] = [];
      const initialProgress: UploadProgressMap = {};
      files.forEach((file, index) => {
        initialProgress[fileKey(file, index)] = 0;
      });
      setProgressByFile(initialProgress);

      for (const [index, file] of files.entries()) {
        const key = fileKey(file, index);
        const uploaded = await uploadFileToDriveResumable(
          token,
          file,
          DRIVE_FOLDER_ID,
          (percent) => {
            setProgressByFile((prev) => ({
              ...prev,
              [key]: percent,
            }));
          }
        );
        metadataResults.push(uploaded);
      }

      setStatus("Sending to Make...");
      const submitResponse = await fetch("/api/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          context: context.trim(),
          driveFolderId: DRIVE_FOLDER_ID,
          files: metadataResults,
        }),
      });

      const submitBody = (await submitResponse
        .json()
        .catch(() => null)) as SubmitApiResponse | null;

      if (!submitResponse.ok) {
        const errorMessage =
          (submitBody && typeof submitBody.message === "string" && submitBody.message) ||
          (submitBody && typeof submitBody.error === "string" && submitBody.error) ||
          `Server returned ${submitResponse.status}.`;
        throw new Error(errorMessage);
      }

      const successMessage =
        (submitBody && typeof submitBody.message === "string" && submitBody.message) ||
        "Submitted successfully";
      setStatus(successMessage);
      setContext("");
      setFiles([]);
      setProgressByFile({});
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unexpected error occurred.";
      setStatus(`Error: ${message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="page">
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onLoad={() => setGisLoaded(true)}
        onError={() =>
          setStatus("Error: Failed to load Google authentication script.")
        }
      />

      <section className="panel">
        <h1>Pitch Deck Intake</h1>
        <form onSubmit={handleSubmit} className="form">
          <label htmlFor="product-files">
            Product files (cut sheets, forms, PDFs)
          </label>
          <input
            ref={fileInputRef}
            id="product-files"
            name="product-files"
            type="file"
            multiple
            accept={ACCEPTED_FILE_TYPES}
            onChange={handleFileChange}
            disabled={isSubmitting}
          />

          <label htmlFor="context">Context for the pitch deck</label>
          <textarea
            id="context"
            name="context"
            rows={10}
            value={context}
            onChange={(event) => setContext(event.target.value)}
            required
            disabled={isSubmitting}
          />

          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Working..." : "Generate Pitch Deck"}
          </button>
        </form>

        {status && <p className="status">{status}</p>}

        {files.length > 0 && (
          <ul className="progress-list">
            {files.map((file, index) => {
              const key = fileKey(file, index);
              const percent = progressByFile[key];
              return (
                <li key={key}>
                  <span className="file-name">{file.name}</span>
                  <span>{typeof percent === "number" ? `${percent}%` : "-"}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
