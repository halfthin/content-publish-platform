import { promises as fs } from 'node:fs';
import { dirname, extname, join, parse, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fileTypeFromBuffer } from 'file-type';
import type {
  OpenClawArtifact,
  OpenClawCallbackEnvelopeV1,
  OpenClawCallbackRefs,
} from '../types/openclaw-callback';
import { MediaLibraryError } from './media-library.service';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '../../../..');
const DEFAULT_CONTENT_DIR = resolve(PROJECT_ROOT, 'content');
const CONTENT_BASE_DIR = process.env.CONTENT_DIR
  ? resolve(PROJECT_ROOT, process.env.CONTENT_DIR)
  : DEFAULT_CONTENT_DIR;

const MAX_UPLOAD_FILES = 50;
const MAX_TOTAL_UPLOAD_BYTES = 200 * 1024 * 1024;

type StoredArtifactKind = OpenClawArtifact['kind'];

const IMAGE_MIME_EXTENSIONS: Record<string, string> = {
  'image/gif': '.gif',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

export interface OpenClawUploadFileInput {
  fieldName: string;
  file: File;
}

export interface StoredOpenClawUploadFile {
  fieldName: string;
  originalName: string;
  storedName: string;
  absolutePath: string;
  relativePath: string;
  mimeType: string;
  size: number;
}

export interface StoredOpenClawUploadBatch {
  directory: {
    absolutePath: string;
    relativePath: string;
  };
  manifest: {
    absolutePath: string;
    relativePath: string;
  };
  files: StoredOpenClawUploadFile[];
  artifacts: OpenClawArtifact[];
}

export interface OpenClawResultStorageService {
  store(input: {
    taskId: string;
    eventId: string;
    actionType: string;
    timestamp: string;
    refs?: OpenClawCallbackRefs;
    payload: OpenClawCallbackEnvelopeV1;
    files: OpenClawUploadFileInput[];
  }): Promise<StoredOpenClawUploadBatch>;
  cleanup(batch: StoredOpenClawUploadBatch): Promise<void>;
}

interface CreateOpenClawResultStorageServiceOptions {
  contentBaseDir?: string;
}

function sanitizeSegment(value: string, fallback: string): string {
  let sanitized = value.trim();
  sanitized = Array.from(sanitized, (char) => {
    const codePoint = char.codePointAt(0) || 0;
    if (codePoint < 32 || '<>:"/\\|?*'.includes(char)) {
      return '_';
    }
    return char;
  }).join('');
  sanitized = sanitized.replace(/\s+/g, '-').replace(/^\.+/, '').replace(/\.+$/, '');

  return sanitized || fallback;
}

function resolveContentBaseDir(contentBaseDir?: string): string {
  if (!contentBaseDir) {
    return CONTENT_BASE_DIR;
  }

  return resolve(contentBaseDir);
}

function getDatedUploadRelativeDir(taskId: string, timestamp: string) {
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    throw new MediaLibraryError('INVALID_PATH', 'Invalid callback timestamp', 400);
  }

  const year = String(parsed.getUTCFullYear());
  const month = String(parsed.getUTCMonth() + 1).padStart(2, '0');
  const day = String(parsed.getUTCDate()).padStart(2, '0');

  return join('uploaded', 'openclaw', year, month, day, sanitizeSegment(taskId, 'task'));
}

function inferArtifactKind(mimeType: string): StoredArtifactKind {
  if (mimeType.startsWith('image/')) {
    return 'image';
  }

  if (mimeType.startsWith('video/')) {
    return 'video';
  }

  return 'file';
}

async function readFileBuffer(file: File): Promise<Buffer> {
  return Buffer.from(await file.arrayBuffer());
}

async function resolveStoredFile(
  file: File,
  index: number,
  directoryPath: string,
  directoryRelativePath: string
): Promise<StoredOpenClawUploadFile> {
  const buffer = await readFileBuffer(file);
  const detectedType = await fileTypeFromBuffer(buffer);
  const detectedMimeType = detectedType?.mime || file.type || '';
  const extension =
    (detectedMimeType && IMAGE_MIME_EXTENSIONS[detectedMimeType]) ||
    (detectedType?.ext ? `.${detectedType.ext}` : '') ||
    extname(file.name).toLowerCase();

  if (!detectedMimeType.startsWith('image/') || !extension) {
    throw new MediaLibraryError(
      'UNSUPPORTED_FILE',
      `Unsupported uploaded file type: ${file.name || 'unknown'}`,
      400
    );
  }

  const originalName = file.name || `file-${index + 1}${extension}`;
  const parsedName = parse(originalName);
  const storedName = `${String(index + 1).padStart(2, '0')}-${sanitizeSegment(
    parsedName.name,
    'file'
  )}${extension}`;
  const absolutePath = join(directoryPath, storedName);
  const relativePath = join(directoryRelativePath, storedName);

  await fs.writeFile(absolutePath, buffer);

  return {
    fieldName: 'files',
    originalName,
    storedName,
    absolutePath,
    relativePath,
    mimeType: detectedMimeType,
    size: buffer.byteLength,
  };
}

export function createOpenClawResultStorageService(
  options: CreateOpenClawResultStorageServiceOptions = {}
): OpenClawResultStorageService {
  const contentBaseDir = resolveContentBaseDir(options.contentBaseDir);

  return {
    async store(input) {
      if (!input.files.length) {
        throw new MediaLibraryError('INVALID_PATH', 'At least one uploaded file is required', 400);
      }

      if (input.files.length > MAX_UPLOAD_FILES) {
        throw new MediaLibraryError(
          'INVALID_PATH',
          `Too many uploaded files, maximum is ${MAX_UPLOAD_FILES}`,
          400
        );
      }

      const totalBytes = input.files.reduce((sum, item) => sum + item.file.size, 0);
      if (totalBytes > MAX_TOTAL_UPLOAD_BYTES) {
        throw new MediaLibraryError(
          'INVALID_PATH',
          `Uploaded files exceed ${MAX_TOTAL_UPLOAD_BYTES} bytes`,
          400
        );
      }

      const directoryRelativePath = getDatedUploadRelativeDir(input.taskId, input.timestamp);
      const directoryPath = join(contentBaseDir, directoryRelativePath);
      await fs.mkdir(directoryPath, { recursive: true });

      const files: StoredOpenClawUploadFile[] = [];
      for (const [index, fileInput] of input.files.entries()) {
        const storedFile = await resolveStoredFile(
          fileInput.file,
          index,
          directoryPath,
          directoryRelativePath
        );
        files.push({
          ...storedFile,
          fieldName: fileInput.fieldName,
        });
      }

      const artifacts: OpenClawArtifact[] = files.map((file) => ({
        kind: inferArtifactKind(file.mimeType),
        role: 'generated',
        name: file.storedName,
        path: file.absolutePath,
        url: null,
        mimeType: file.mimeType,
        meta: {
          fieldName: file.fieldName,
          originalName: file.originalName,
          relativePath: file.relativePath,
          size: file.size,
        },
      }));

      const manifestRelativePath = join(directoryRelativePath, 'manifest.json');
      const manifestAbsolutePath = join(contentBaseDir, manifestRelativePath);
      const storedAt = new Date().toISOString();

      await fs.writeFile(
        manifestAbsolutePath,
        JSON.stringify(
          {
            version: '1.0',
            source: 'openclaw',
            taskId: input.taskId,
            eventId: input.eventId,
            actionType: input.actionType,
            refs: input.refs,
            storedAt,
            directory: {
              absolutePath: directoryPath,
              relativePath: directoryRelativePath,
            },
            files,
            payload: input.payload,
          },
          null,
          2
        ),
        'utf-8'
      );

      return {
        directory: {
          absolutePath: directoryPath,
          relativePath: directoryRelativePath,
        },
        manifest: {
          absolutePath: manifestAbsolutePath,
          relativePath: manifestRelativePath,
        },
        files,
        artifacts,
      };
    },

    async cleanup(batch) {
      await fs.rm(batch.directory.absolutePath, { recursive: true, force: true });
    },
  };
}
