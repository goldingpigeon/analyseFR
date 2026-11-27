import { motion, type HTMLMotionProps } from 'framer-motion';

type Variant = 'primary' | 'ghost' | 'coral' | 'chip';

const STYLES: Record<Variant, string> = {
  primary:
    'bg-gradient-to-b from-aqua-soft to-aqua text-abyss font-display font-semibold shadow-[0_0_28px_-10px_rgba(255,255,255,0.3)]',
  coral:
    'bg-gradient-to-b from-coral-soft to-coral text-abyss font-display font-semibold shadow-[0_0_28px_-10px_rgba(255,255,255,0.22)]',
  ghost: 'bg-reef/70 text-foam border border-aqua/20 hover:border-aqua/50',
  chip: 'bg-deep/80 text-mist border border-aqua/15 hover:text-foam hover:border-aqua/40 text-sm',
};

export function SpringButton({
  variant = 'ghost',
  className = '',
  active,
  ...props
}: HTMLMotionProps<'button'> & { variant?: Variant; active?: boolean }) {
  return (
    <motion.button
      type="button"
      whileHover={props.disabled ? undefined : { scale: 1.04, y: -1 }}
      whileTap={props.disabled ? undefined : { scale: 0.94 }}
      transition={{ type: 'spring', stiffness: 520, damping: 22 }}
      className={`cursor-pointer rounded-full px-4 py-2 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${STYLES[variant]} ${
        active ? '!border-aqua !text-aqua bg-aqua/10' : ''
      } ${className}`}
      {...props}
    />
  );
}
