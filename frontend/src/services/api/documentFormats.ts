import { apiClient } from "./client";

export interface DocumentFormatGovernance {
  documentFormats: Record<string, string>;
  defaults: {
    previewFormat: string;
    canonicalFormat: string;
  };
  supported: {
    canonicalFormats: string[];
    previewFormats: string[];
    ingestFormats: string[];
    ingestMimeTypes: string[];
    ingestExtensions: string[];
    uploadAccept: string;
  };
  mappings: {
    mimeByFormat: Record<string, string>;
    extensionByFormat: Record<string, string>;
  };
}

let governanceCache: DocumentFormatGovernance | null = null;
let governancePromise: Promise<DocumentFormatGovernance> | null = null;

function buildFallbackGovernance(): DocumentFormatGovernance {
  const ingestExtensions = [
    "pdf",
    "docx",
    "xlsx",
    "pptx",
    "html",
    "md",
    "txt",
    "csv",
    "json",
    "rtf",
    "png",
    "jpg",
    "jpeg",
    "gif",
    "bmp",
    "webp",
    "tif",
    "tiff",
    "heic",
    "heif",
  ];
  return {
    documentFormats: {
      PDF: "pdf",
      DOCX: "docx",
      XLSX: "xlsx",
      HTML: "html",
      MD: "md",
      TXT: "txt",
    },
    defaults: {
      previewFormat: "html",
      canonicalFormat: "pdf",
    },
    supported: {
      canonicalFormats: ["pdf", "docx", "xlsx"],
      previewFormats: ["html"],
      ingestFormats: ingestExtensions,
      ingestMimeTypes: [],
      ingestExtensions,
      uploadAccept: ingestExtensions.map((ext) => `.${ext}`).join(","),
    },
    mappings: {
      mimeByFormat: {},
      extensionByFormat: {},
    },
  };
}

export async function getDocumentFormatGovernance(): Promise<DocumentFormatGovernance> {
  if (governanceCache) return governanceCache;
  if (governancePromise) return governancePromise;

  governancePromise = apiClient
    .get<DocumentFormatGovernance>("/documents/formats/governance")
    .then((data) => {
      governanceCache = data;
      return data;
    })
    .catch(() => {
      const fallback = buildFallbackGovernance();
      governanceCache = fallback;
      return fallback;
    })
    .finally(() => {
      governancePromise = null;
    });

  return governancePromise;
}

