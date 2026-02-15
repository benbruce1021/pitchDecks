export const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";

type TokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

type TokenError = {
  type: string;
};

type TokenClient = {
  requestAccessToken: (options?: { prompt?: string }) => void;
};

export type DriveFileMetadata = {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string;
};

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: TokenResponse) => void;
            error_callback?: (error: TokenError) => void;
          }) => TokenClient;
        };
      };
    };
  }
}

function resolveFileContentType(file: File): string {
  return file.type || "application/pdf";
}

async function createResumableUploadSession(
  accessToken: string,
  file: File,
  folderId: string
): Promise<string> {
  // Step 1: ask Drive for a resumable session URL and target folder placement.
  const sessionResponse = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,mimeType,webViewLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": resolveFileContentType(file),
        "X-Upload-Content-Length": String(file.size),
      },
      body: JSON.stringify({
        name: file.name,
        parents: [folderId],
      }),
    }
  );

  if (!sessionResponse.ok) {
    const body = await sessionResponse.text();
    throw new Error(
      `Could not create upload session for "${file.name}" (${sessionResponse.status}): ${body}`
    );
  }

  const uploadUrl = sessionResponse.headers.get("Location");
  if (!uploadUrl) {
    throw new Error(`Missing resumable upload URL for "${file.name}".`);
  }

  return uploadUrl;
}

function uploadFileBytesWithProgress(
  uploadUrl: string,
  accessToken: string,
  file: File,
  onProgress?: (percent: number) => void
): Promise<DriveFileMetadata> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    // Step 2: stream the raw file bytes to the resumable session URL.
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
    xhr.setRequestHeader("Content-Type", resolveFileContentType(file));
    xhr.responseType = "text";

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || !onProgress) {
        return;
      }
      const percent = Math.round((event.loaded / event.total) * 100);
      onProgress(percent);
    };

    xhr.onerror = () => {
      reject(new Error(`Network error while uploading "${file.name}".`));
    };

    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(
          new Error(
            `Upload failed for "${file.name}" (${xhr.status}): ${xhr.responseText}`
          )
        );
        return;
      }

      try {
        const parsed = JSON.parse(xhr.responseText) as DriveFileMetadata;
        if (!parsed.id || !parsed.name || !parsed.mimeType || !parsed.webViewLink) {
          reject(new Error(`Incomplete metadata returned for "${file.name}".`));
          return;
        }
        onProgress?.(100);
        resolve(parsed);
      } catch {
        reject(new Error(`Invalid metadata response for "${file.name}".`));
      }
    };

    xhr.send(file);
  });
}

export function requestGoogleAccessToken(
  clientId: string,
  prompt: "consent" | "" = "consent"
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!window.google?.accounts?.oauth2) {
      reject(
        new Error(
          "Google Identity Services script is not loaded. Refresh and try again."
        )
      );
      return;
    }

    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_FILE_SCOPE,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(
            new Error(
              response.error_description ||
                response.error ||
                "Google did not return an access token."
            )
          );
          return;
        }

        resolve(response.access_token);
      },
      error_callback: () => {
        reject(new Error("Google authentication failed."));
      },
    });

    tokenClient.requestAccessToken({ prompt });
  });
}

export async function uploadFileToDriveResumable(
  accessToken: string,
  file: File,
  folderId: string,
  onProgress?: (percent: number) => void
): Promise<DriveFileMetadata> {
  const uploadUrl = await createResumableUploadSession(accessToken, file, folderId);
  return uploadFileBytesWithProgress(uploadUrl, accessToken, file, onProgress);
}
