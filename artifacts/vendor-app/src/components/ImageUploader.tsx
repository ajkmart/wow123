import { useState, useRef } from "react";
import { api } from "../lib/api";
import { usePlatformConfig } from "../lib/useConfig";
import { INPUT, LABEL } from "../lib/ui";
import { useLanguage } from "../lib/useLanguage";
import { tDual, type TranslationKey } from "@workspace/i18n";
import { SafeImage } from "./ui/SafeImage";

const DEFAULT_MAX_IMAGE_MB = 5;
const DEFAULT_ALLOWED_IMAGE_FORMATS = ["image/jpeg", "image/png", "image/webp"];

interface ImageUploaderProps {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  placeholder?: string;
  previewHeight?: string;
}

export function ImageUploader({
  value,
  onChange,
  label,
  placeholder = "https://...",
  previewHeight = "h-40",
}: ImageUploaderProps) {
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const { config } = usePlatformConfig();

  const maxImageMb = config.uploads?.maxImageMb ?? DEFAULT_MAX_IMAGE_MB;
  const allowedFormats = (config.uploads?.allowedImageFormats ?? []).length > 0
    ? (config.uploads!.allowedImageFormats!).map(f => `image/${f}`)
    : DEFAULT_ALLOWED_IMAGE_FORMATS;
  const allowedFormatLabels = (config.uploads?.allowedImageFormats ?? ["jpeg", "png", "webp"])
    .map(f => f.toUpperCase()).join(", ");

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"upload" | "url">(value && value.startsWith("http") ? "url" : "upload");
  const fileRef = useRef<HTMLInputElement>(null);


  const handleFile = async (file: File) => {
    if (uploading) return;
    if (!allowedFormats.some(fmt => file.type === fmt || file.type.startsWith(fmt))) {
      setError(T("invalidFileType"));
      return;
    }
    if (file.size > maxImageMb * 1024 * 1024) {
      setError(T("fileTooLarge"));
      return;
    }
    setError("");
    setUploading(true);
    try {
      const result = await api.uploadImage(file);
      onChange(result.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : T("somethingWentWrong"));
    }
    setUploading(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (uploading) return;
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className={`${LABEL} mb-0`}>{label || T("imageUrlLabel")}</label>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setMode("upload")}
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full transition-colors ${
              mode === "upload"
                ? "bg-orange-100 text-orange-600"
                : "bg-gray-100 text-gray-400 hover:text-gray-600"
            }`}
          >
            📷 {T("send")}
          </button>
          <button
            type="button"
            onClick={() => setMode("url")}
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full transition-colors ${
              mode === "url"
                ? "bg-orange-100 text-orange-600"
                : "bg-gray-100 text-gray-400 hover:text-gray-600"
            }`}
          >
            🔗 URL
          </button>
        </div>
      </div>

      {mode === "upload" ? (
        <div
          onDragOver={e => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className={`w-full border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
            uploading
              ? "border-orange-300 bg-orange-50"
              : value
                ? "border-green-300 bg-green-50"
                : "border-gray-200 bg-gray-50 hover:border-orange-300 hover:bg-orange-50"
          } flex flex-col items-center justify-center py-6 px-4`}
        >
          <input
            ref={fileRef}
            type="file"
            accept={allowedFormats.join(",")}
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = "";
            }}
          />
          {uploading ? (
            <>
              <div className="w-8 h-8 border-3 border-orange-400 border-t-transparent rounded-full animate-spin mb-2" />
              <p className="text-xs font-bold text-orange-600">{T("loading")}</p>
            </>
          ) : value ? (
            <>
              <p className="text-xs font-bold text-green-600 mb-1">✓ {T("success")}</p>
              <p className="text-[10px] text-gray-400">{T("edit")}</p>
            </>
          ) : (
            <>
              <span className="text-2xl mb-1">📷</span>
              <p className="text-xs font-bold text-gray-500">{T("imageUrlLabel")}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{allowedFormatLabels} · Max {maxImageMb}MB</p>
            </>
          )}
        </div>
      ) : (
        <input
          type="url"
          value={value}
          onChange={e => { onChange(e.target.value); setError(""); }}
          placeholder={placeholder}
          className={INPUT}
        />
      )}

      {error && (
        <p className="text-xs text-red-500 font-medium mt-1">⚠️ {error}</p>
      )}

      {value && (
        <div className={`rounded-xl overflow-hidden ${previewHeight} bg-gray-100 mt-3 relative group`}>
          <SafeImage
            key={value}
            src={value}
            alt="preview"
            className="w-full h-full object-cover"
            fallbackClassName="w-full h-full"
            loading="eager"
          />
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onChange(""); }}
            className="absolute top-2 right-2 w-7 h-7 bg-black/50 text-white rounded-full flex items-center justify-center text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
