import { useDropzone } from 'react-dropzone';
import { FileImage, Upload, ArrowUpRight } from 'lucide-react';
import { LIMITS } from '../domain/model';

interface Props {
  onFile: (file: File) => void;
  onError: (message: string) => void;
  disabled: boolean;
  compact?: boolean;
}

export function UploadZone({ onFile, onError, disabled, compact = false }: Props) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'image/png': ['.png'] },
    maxFiles: 1,
    multiple: false,
    maxSize: LIMITS.fileBytes,
    disabled,
    onDropAccepted: (files) => onFile(files[0]),
    onDropRejected: (files) =>
      onError(
        files.some((file) => file.errors.some((error) => error.code === 'file-too-large'))
          ? 'The PNG exceeds 25 MB.'
          : 'Choose a single PNG file up to 25 MB.',
      ),
  });

  return (
    <div
      {...getRootProps({
        className: `upload-zone ${compact ? 'compact' : ''} ${isDragActive ? 'drag-active' : ''}`,
        'aria-label': 'Select PNG image',
        role: 'button',
      })}
    >
      <input {...getInputProps({ 'aria-label': 'PNG file' })} />
      <div className="upload-icon">
        {compact ? <Upload size={19} /> : <FileImage size={30} strokeWidth={1.5} />}
      </div>
      <div>
        <p className="font-semibold text-ink">
          {isDragActive
            ? 'Drop your image here'
            : compact
              ? 'Change image'
              : 'Drag your PNG here'}
        </p>
        {!compact && <p className="mt-2 text-sm text-muted">or click to browse your computer</p>}
      </div>
      {compact ? (
        <ArrowUpRight size={17} className="ml-auto text-muted" />
      ) : (
        <span className="upload-hint">Transparent PNG · Up to 25 MB</span>
      )}
    </div>
  );
}
