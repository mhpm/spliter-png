import { useDropzone } from 'react-dropzone';
import { FileImage, Upload } from 'lucide-react';
import { LIMITS } from '../../domain/model';

const MAX_FRAMES = 200;

interface Props {
  disabled: boolean;
  onFiles: (files: File[]) => void;
  onError: (message: string) => void;
}

export function FrameUploadZone({ disabled, onFiles, onError }: Props) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'image/png': ['.png'] },
    multiple: true,
    maxFiles: MAX_FRAMES,
    maxSize: LIMITS.fileBytes,
    disabled,
    onDropAccepted: onFiles,
    onDropRejected: (rejections) => {
      if (rejections.some(({ errors }) => errors.some((error) => error.code === 'file-too-large'))) {
        onError('Each PNG must be 25 MB or smaller.');
      } else if (
        rejections.some(({ errors }) => errors.some((error) => error.code === 'too-many-files'))
      ) {
        onError(`Choose up to ${MAX_FRAMES} PNG frames.`);
      } else {
        onError('Choose one or more valid PNG files.');
      }
    },
  });

  return (
    <div
      {...getRootProps({
        className: `sprite-frame-upload ${isDragActive ? 'drag-active' : ''}`,
        role: 'button',
        'aria-label': 'Select PNG frame images',
      })}
    >
      <input {...getInputProps({ 'aria-label': 'PNG frame files' })} />
      <span className="sprite-frame-upload-icon">
        {isDragActive ? <Upload size={28} /> : <FileImage size={30} strokeWidth={1.5} />}
      </span>
      <span className="sprite-frame-upload-copy">
        <strong>{isDragActive ? 'Drop your frames here' : 'Drop your PNG frames here'}</strong>
        <small>or click to browse your computer · Up to {MAX_FRAMES} frames</small>
      </span>
      <span className="sprite-frame-upload-action">Choose files</span>
    </div>
  );
}
