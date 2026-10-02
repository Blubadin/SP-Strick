import { useControllerStore } from '../core/controller/ControllerStore';
import { getControllerGlyph } from '../core/controller/ControllerProfile';
import type { SemanticControl } from '../core/controller/ControllerTypes';

interface ControllerGlyphProps {
  control: SemanticControl;
  className?: string;
}

export function ControllerGlyph({ control, className = '' }: ControllerGlyphProps) {
  const profile = useControllerStore((s) => s.profile);
  const glyph = getControllerGlyph(control, profile.type);

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: '22px',
        height: '22px',
        padding: '0 6px',
        fontSize: '0.75rem',
        fontWeight: 700,
        borderRadius: '6px',
        background: 'rgba(255, 255, 255, 0.1)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        color: '#F5F5F7',
        fontFamily: 'system-ui, sans-serif'
      }}
    >
      {glyph}
    </span>
  );
}
