"use client";

import {
  type ChangeEvent,
  type DragEvent,
  type InputHTMLAttributes,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";

export type FileWithPreview = {
  id: string;
  file: File;
  preview?: string;
};

export type FileUploadOptions = {
  maxSize?: number;
  accept?: string;
  multiple?: boolean;
  onFilesChange?: (files: FileWithPreview[]) => void;
};

export type FileUploadState = {
  files: FileWithPreview[];
  isDragging: boolean;
  errors: string[];
};

export type FileUploadActions = {
  addFiles: (files: FileList | File[]) => void;
  removeFile: (id: string) => void;
  clearFiles: () => void;
  clearErrors: () => void;
  handleDragEnter: (e: DragEvent<HTMLElement>) => void;
  handleDragLeave: (e: DragEvent<HTMLElement>) => void;
  handleDragOver: (e: DragEvent<HTMLElement>) => void;
  handleDrop: (e: DragEvent<HTMLElement>) => void;
  handleFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  openFileDialog: () => void;
  getInputProps: (
    props?: InputHTMLAttributes<HTMLInputElement>,
  ) => InputHTMLAttributes<HTMLInputElement> & {
    // biome-ignore lint/suspicious/noExplicitAny: cross-react ref compatibility
    ref: any;
  };
};

export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Number.parseFloat((bytes / k ** i).toFixed(dm))} ${sizes[i]}`;
}

export function useFileUpload(
  options: FileUploadOptions = {},
): [FileUploadState, FileUploadActions] {
  const {
    maxSize = Number.POSITIVE_INFINITY,
    accept = "*",
    multiple = false,
    onFilesChange,
  } = options;

  const [state, setState] = useState<FileUploadState>({
    files: [],
    isDragging: false,
    errors: [],
  });
  const inputRef = useRef<HTMLInputElement>(null);

  const acceptedTypes = useMemo(
    () => accept.split(",").map((type) => type.trim()).filter(Boolean),
    [accept],
  );

  const validateFile = useCallback(
    (file: File): string | null => {
      if (file.size > maxSize) {
        return `File "${file.name}" exceeds the maximum size of ${formatBytes(maxSize)}.`;
      }

      if (accept === "*" || acceptedTypes.length === 0) {
        return null;
      }

      const fileType = file.type || "";
      const extension = `.${file.name.split(".").pop() ?? ""}`.toLowerCase();

      const isAccepted = acceptedTypes.some((type) => {
        if (type.startsWith(".")) return extension === type.toLowerCase();
        if (type.endsWith("/*")) {
          const base = type.split("/")[0];
          return fileType.startsWith(`${base}/`);
        }
        return fileType === type;
      });

      if (!isAccepted) {
        return `File "${file.name}" is not an accepted file type.`;
      }

      return null;
    },
    [accept, acceptedTypes, maxSize],
  );

  const clearFiles = useCallback(() => {
    setState((prev) => {
      for (const item of prev.files) {
        if (item.preview) URL.revokeObjectURL(item.preview);
      }
      if (inputRef.current) inputRef.current.value = "";
      onFilesChange?.([]);
      return { ...prev, files: [], errors: [] };
    });
  }, [onFilesChange]);

  const addFiles = useCallback(
    (incoming: FileList | File[]) => {
      const filesArray = Array.from(incoming);
      if (filesArray.length === 0) return;

      const errors: string[] = [];
      const nextFiles: FileWithPreview[] = [];

      for (const file of filesArray) {
        const error = validateFile(file);
        if (error) {
          errors.push(error);
          continue;
        }

        nextFiles.push({
          file,
          id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 9)}`,
          preview: URL.createObjectURL(file),
        });

        if (!multiple) break;
      }

      setState((prev) => {
        const files = multiple ? [...prev.files, ...nextFiles] : nextFiles;
        onFilesChange?.(files);
        return { ...prev, files, errors };
      });

      if (inputRef.current) inputRef.current.value = "";
    },
    [multiple, onFilesChange, validateFile],
  );

  const removeFile = useCallback(
    (id: string) => {
      setState((prev) => {
        const target = prev.files.find((item) => item.id === id);
        if (target?.preview) URL.revokeObjectURL(target.preview);
        const files = prev.files.filter((item) => item.id !== id);
        onFilesChange?.(files);
        return { ...prev, files, errors: [] };
      });
      if (inputRef.current) inputRef.current.value = "";
    },
    [onFilesChange],
  );

  const clearErrors = useCallback(() => {
    setState((prev) => ({ ...prev, errors: [] }));
  }, []);

  const handleDragEnter = useCallback((e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setState((prev) => ({ ...prev, isDragging: true }));
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setState((prev) => ({ ...prev, isDragging: false }));
  }, []);

  const handleDragOver = useCallback((e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setState((prev) => ({ ...prev, isDragging: false }));
      if (inputRef.current?.disabled) return;
      if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
    },
    [addFiles],
  );

  const handleFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      if (e.target.files?.length) addFiles(e.target.files);
    },
    [addFiles],
  );

  const openFileDialog = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const getInputProps = useCallback(
    (props: InputHTMLAttributes<HTMLInputElement> = {}) => ({
      ...props,
      type: "file" as const,
      accept: props.accept ?? accept,
      multiple: props.multiple ?? multiple,
      onChange: handleFileChange,
      // biome-ignore lint/suspicious/noExplicitAny: cross-react ref compatibility
      ref: inputRef as any,
    }),
    [accept, handleFileChange, multiple],
  );

  return [
    state,
    {
      addFiles,
      removeFile,
      clearFiles,
      clearErrors,
      handleDragEnter,
      handleDragLeave,
      handleDragOver,
      handleDrop,
      handleFileChange,
      openFileDialog,
      getInputProps,
    },
  ];
}

