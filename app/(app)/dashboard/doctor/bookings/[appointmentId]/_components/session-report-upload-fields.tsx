"use client";

import {
  AlertCircleIcon,
  FileArchiveIcon,
  FileIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  HeadphonesIcon,
  ImageIcon,
  PencilIcon,
  Trash2Icon,
  UploadCloudIcon,
  UploadIcon,
  VideoIcon,
  XIcon,
} from "lucide-react";
import { type KeyboardEvent, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import { formatBytes, useFileUpload } from "@/hooks/use-file-upload";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
const ACCEPTED_FILE_TYPES =
  ".pdf,.doc,.docx,.txt,.rtf,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.zip";

function defaultTitleFromFileName(fileName: string) {
  return fileName.replace(/\.[^/.]+$/, "") || fileName;
}

function getFileIcon(file: File) {
  const fileType = file.type;
  const fileName = file.name;

  if (
    fileType.includes("pdf") ||
    fileName.endsWith(".pdf") ||
    fileType.includes("word") ||
    fileName.endsWith(".doc") ||
    fileName.endsWith(".docx")
  ) {
    return <FileTextIcon className="size-4 opacity-60" />;
  }
  if (
    fileType.includes("zip") ||
    fileType.includes("archive") ||
    fileName.endsWith(".zip") ||
    fileName.endsWith(".rar")
  ) {
    return <FileArchiveIcon className="size-4 opacity-60" />;
  }
  if (
    fileType.includes("excel") ||
    fileName.endsWith(".xls") ||
    fileName.endsWith(".xlsx")
  ) {
    return <FileSpreadsheetIcon className="size-4 opacity-60" />;
  }
  if (fileType.startsWith("video/")) {
    return <VideoIcon className="size-4 opacity-60" />;
  }
  if (fileType.startsWith("audio/")) {
    return <HeadphonesIcon className="size-4 opacity-60" />;
  }
  if (fileType.startsWith("image/")) {
    return <ImageIcon className="size-4 opacity-60" />;
  }
  return <FileIcon className="size-4 opacity-60" />;
}

function UploadSubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button disabled={disabled || pending} type="submit">
      <UploadCloudIcon aria-hidden="true" className="-ms-1 size-4 opacity-60" />
      {pending ? "Uploading..." : "Upload Report"}
    </Button>
  );
}

type SessionReportUploadFieldsProps = {
  appointmentId: string;
  action: (formData: FormData) => void | Promise<void>;
};

export function SessionReportUploadFields({
  appointmentId,
  action,
}: SessionReportUploadFieldsProps) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editedTitlesById, setEditedTitlesById] = useState<
    Record<string, string>
  >({});

  const [{ files, isDragging, errors }, uploader] = useFileUpload({
    accept: ACCEPTED_FILE_TYPES,
    maxSize: MAX_FILE_SIZE,
    multiple: true,
  });

  const titlesJson = useMemo(
    () =>
      JSON.stringify(
        files.map((item) =>
          (
            editedTitlesById[item.id] || defaultTitleFromFileName(item.file.name)
          ).trim(),
        ),
      ),
    [editedTitlesById, files],
  );

  const handleTitleCommit = (id: string) => {
    setEditedTitlesById((prev) => {
      const current = prev[id]?.trim();
      if (current && current.length > 0) {
        return { ...prev, [id]: current };
      }
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setEditingId(null);
  };

  const handleTitleKeyDown = (
    id: string,
    event: KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleTitleCommit(id);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setEditingId(null);
    }
  };

  const handleDialogChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setEditingId(null);
    }
  };

  return (
    <Dialog onOpenChange={handleDialogChange} open={open}>
      <DialogTrigger asChild>
        <Button type="button">
          <UploadCloudIcon aria-hidden="true" className="-ms-1 size-4 opacity-60" />
          Upload Report
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Upload Session Reports</DialogTitle>
          <DialogDescription>
            Select one or multiple files. Double-click title to edit before upload.
          </DialogDescription>
        </DialogHeader>

        <form action={action} className="space-y-4">
          <input name="appointmentId" type="hidden" value={appointmentId} />
          <input name="titlesJson" type="hidden" value={titlesJson} />

          <div
            className="rounded-xl border border-input border-dashed p-4 text-center transition-colors data-[dragging=true]:bg-accent/50"
            data-dragging={isDragging || undefined}
            onDragEnter={uploader.handleDragEnter}
            onDragLeave={uploader.handleDragLeave}
            onDragOver={uploader.handleDragOver}
            onDrop={uploader.handleDrop}
          >
            <input
              {...uploader.getInputProps({
                className: "sr-only",
                name: "files",
              })}
              aria-label="Upload report files"
            />

            <div
              aria-hidden="true"
              className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full border bg-background"
            >
              <FileIcon className="size-4 opacity-60" />
            </div>
            <p className="font-medium text-sm">Upload files</p>
            <p className="text-muted-foreground text-xs">
              Drag and drop or click to browse
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              Accepted files - Up to {formatBytes(MAX_FILE_SIZE)} each
            </p>
            <Button
              className="mt-3"
              onClick={uploader.openFileDialog}
              type="button"
              variant="outline"
            >
              <UploadIcon aria-hidden="true" className="-ms-1 size-4 opacity-60" />
              Select files
            </Button>
          </div>

          {files.length > 0 && (
            <div className="space-y-2">
              {files.map((item) => {
                const isEditing = editingId === item.id;
                return (
                  <div
                    className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2"
                    key={item.id}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="shrink-0 rounded-md border p-2">
                        {getFileIcon(item.file)}
                      </div>
                      <div className="min-w-0">
                        {isEditing ? (
                          <Input
                            autoFocus
                            className="h-7"
                            onBlur={() => handleTitleCommit(item.id)}
                            onChange={(event) =>
                              setEditedTitlesById((prev) => ({
                                ...prev,
                                [item.id]: event.target.value,
                              }))
                            }
                            onKeyDown={(event) => handleTitleKeyDown(item.id, event)}
                            value={
                              editedTitlesById[item.id] ??
                              defaultTitleFromFileName(item.file.name)
                            }
                          />
                        ) : (
                          <button
                            className="flex max-w-full items-center gap-1 truncate text-left text-sm"
                            onDoubleClick={() => setEditingId(item.id)}
                            type="button"
                          >
                            <span className="truncate">
                              {editedTitlesById[item.id] ||
                                defaultTitleFromFileName(item.file.name)}
                            </span>
                            <PencilIcon className="size-3 opacity-60" />
                          </button>
                        )}
                        <p className="truncate text-muted-foreground text-xs">
                          {item.file.name} - {formatBytes(item.file.size)}
                        </p>
                      </div>
                    </div>

                    <Button
                      aria-label={`Remove ${item.file.name}`}
                      className="size-8"
                      onClick={() => {
                        uploader.removeFile(item.id);
                        setEditedTitlesById((prev) => {
                          const next = { ...prev };
                          delete next[item.id];
                          return next;
                        });
                        if (editingId === item.id) {
                          setEditingId(null);
                        }
                      }}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <XIcon className="size-4" />
                    </Button>
                  </div>
                );
              })}

              <Button
                onClick={() => {
                  uploader.clearFiles();
                  setEditedTitlesById({});
                  setEditingId(null);
                }}
                type="button"
                variant="outline"
              >
                <Trash2Icon aria-hidden="true" className="-ms-1 size-4 opacity-60" />
                Remove all files
              </Button>
            </div>
          )}

          {errors.length > 0 && (
            <div
              className="flex items-center gap-1 text-destructive text-xs"
              role="alert"
            >
              <AlertCircleIcon className="size-3 shrink-0" />
              <span>{errors[0]}</span>
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => setOpen(false)} type="button" variant="outline">
              Cancel
            </Button>
            <UploadSubmitButton disabled={files.length === 0} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

