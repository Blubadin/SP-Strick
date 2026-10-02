import { useControllerStore } from '../core/controller/ControllerStore';
import { getControllerGlyph } from '../core/controller/ControllerProfile';
import type { ControllerType, SemanticControl } from '../core/controller/ControllerTypes';
import styles from './ControllerGlyph.module.css';

interface ControllerGlyphProps {
  control: SemanticControl;
  className?: string;
  size?: 'small' | 'medium' | 'large';
  pressed?: boolean;
  inactive?: boolean;
  type?: ControllerType;
}

export function ControllerGlyph({
  control,
  className = '',
  size = 'medium',
  pressed = false,
  inactive = false,
  type
}: ControllerGlyphProps) {
  const activeType = useControllerStore((s) => s.profile.type);
  const glyph = getControllerGlyph(control, type || activeType);
  const classNames = [
    styles.glyph,
    styles[size],
    styles[control.toLowerCase()],
    pressed ? styles.pressed : '',
    inactive ? styles.inactive : '',
    className
  ].filter(Boolean).join(' ');

  return <span aria-hidden="true" className={classNames}>{glyph}</span>;
}
