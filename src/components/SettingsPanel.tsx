import {
  Button,
  Slider,
  SliderOutput,
  SliderThumb,
  SliderTrack,
  Label,
  NumberField,
  Group,
  Input,
} from 'react-aria-components';
import {
  ChevronDown,
  Minus,
  Plus,
  RotateCcw,
  ScanLine,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';
import type { ExtractionOptions } from '../domain/model';
import { DEFAULT_OPTIONS } from '../domain/model';

interface Props {
  options: ExtractionOptions;
  onChange: (options: ExtractionOptions) => void;
  canExtract: boolean;
  disabled: boolean;
  hasResults: boolean;
  onExtract: () => void;
}
function NumericSetting({
  label,
  description,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  description: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <NumberField
      value={value}
      minValue={min}
      maxValue={max}
      step={1}
      onChange={(next) => onChange(Number.isNaN(next) ? min : next)}
      className="number-setting"
    >
      <div>
        <Label>{label}</Label>
        <p>{description}</p>
      </div>
      <Group className="number-group">
        <Button slot="decrement" aria-label={`Decrease ${label.toLowerCase()}`}>
          <Minus size={13} />
        </Button>
        <Input />
        <Button slot="increment" aria-label={`Increase ${label.toLowerCase()}`}>
          <Plus size={13} />
        </Button>
      </Group>
    </NumberField>
  );
}

export function SettingsPanel({
  options,
  onChange,
  canExtract,
  disabled,
  hasResults,
  onExtract,
}: Props) {
  return (
    <section className="settings-panel" aria-label="Extraction settings">
      <div className="flex items-center gap-2.5">
        <SlidersHorizontal size={17} />
        <h2 className="font-semibold">Extraction settings</h2>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        We separate elements based on your PNG's transparency.
      </p>
      <fieldset disabled={disabled} className="mt-7 min-w-0">
        <Slider
          minValue={0}
          maxValue={254}
          step={1}
          value={options.alphaThreshold}
          onChange={(value) => onChange({ ...options, alphaThreshold: Number(value) })}
          isDisabled={disabled}
          className="threshold-slider"
        >
          <div className="flex items-center justify-between">
            <Label>Transparency threshold</Label>
            <SliderOutput className="value-badge" />
          </div>
          <SliderTrack>
            {({ state }) => (
              <>
                <div className="slider-rail" />
                <div
                  className="slider-fill"
                  style={{ width: `${state.getThumbPercent(0) * 100}%` }}
                />
                <SliderThumb />
              </>
            )}
          </SliderTrack>
          <div className="flex justify-between text-xs text-muted">
            <span>More detail</span>
            <span>Less noise</span>
          </div>
        </Slider>
        {options.alphaThreshold === 0 && (
          <p className="mt-3 text-xs text-amber-800">
            0 includes fully transparent pixels: the whole image will become a single element.
          </p>
        )}
        <details className="advanced-settings">
          <summary>
            More settings
            <ChevronDown size={15} />
          </summary>
          <div className="mt-4 space-y-5">
            <NumericSetting
              label="Minimum area"
              description="Visible pixels per element"
              value={options.minArea}
              min={1}
              max={16777216}
              onChange={(minArea) => onChange({ ...options, minArea })}
            />
            <NumericSetting
              label="Minimum size"
              description="Width and height, in pixels"
              value={options.minSize}
              min={1}
              max={8192}
              onChange={(minSize) => onChange({ ...options, minSize })}
            />
            <NumericSetting
              label="Padding"
              description="Space around cutout"
              value={options.padding}
              min={0}
              max={256}
              onChange={(padding) => onChange({ ...options, padding })}
            />
            <Button
              className="reset-button"
              onPress={() => onChange({ ...DEFAULT_OPTIONS })}
              isDisabled={disabled}
            >
              <RotateCcw size={13} /> Reset settings
            </Button>
          </div>
        </details>
      </fieldset>
      <Button
        className="primary-button mt-6 w-full"
        isDisabled={!canExtract || disabled}
        onPress={onExtract}
      >
        <ScanLine size={17} />
        {hasResults ? 'Re-extract' : 'Extract elements'}
      </Button>
      {hasResults && (
        <p className="mt-2 text-xs leading-relaxed text-muted">
          Re-extracting resets element names.
        </p>
      )}
      <div className="privacy-note">
        <ShieldCheck size={19} />
        <div>
          <p>Your image stays with you</p>
          <span>Everything is processed in your browser. Your files are never uploaded to a server.</span>
        </div>
      </div>
    </section>
  );
}
