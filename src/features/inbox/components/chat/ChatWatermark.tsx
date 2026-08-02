import { memo } from 'react';
import { motion } from '@/components/ui/motion';

/**
 * Subtle space-themed chat watermark inspired by WhatsApp Web's doodle pattern.
 * Hand-drawn style vectors: rockets, planets, stars, moon, UFO, comets, satellites.
 * Very low opacity for a singelo, non-intrusive feel.
 */
export const ChatWatermark = memo(function ChatWatermark() {
  return (
    <div
      className="absolute inset-0 overflow-hidden pointer-events-none select-none"
      aria-hidden="true"
    >
      <motion.svg
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.5 }}
        className="absolute inset-0 w-full h-full text-foreground"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="none"
      >
        <defs>
          <pattern
            id="chat-pattern"
            x="0"
            y="0"
            width="320"
            height="320"
            patternUnits="userSpaceOnUse"
          >
            <g
              fill="none"
              stroke="currentColor"
              strokeWidth="1.1"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.04"
            >
              {/* Rocket */}
              <g transform="translate(30, 30)">
                <path d="M14 0 C20 6 22 14 22 22 L14 28 L6 22 C6 14 8 6 14 0 Z" />
                <circle cx="14" cy="12" r="3" />
                <path d="M6 22 L2 30 L8 26 M22 22 L26 30 L20 26" />
                <path d="M11 30 L14 36 L17 30" />
              </g>

              {/* Saturn */}
              <g transform="translate(220, 40)">
                <circle cx="20" cy="20" r="14" />
                <ellipse cx="20" cy="20" rx="24" ry="6" transform="rotate(-18 20 20)" />
              </g>

              {/* Crescent moon */}
              <g transform="translate(120, 70)">
                <path d="M22 4 A18 18 0 1 0 22 36 A14 14 0 1 1 22 4 Z" />
                <circle cx="14" cy="16" r="1.4" fill="currentColor" />
                <circle cx="11" cy="24" r="1" fill="currentColor" />
              </g>

              {/* Star big */}
              <g transform="translate(70, 140)">
                <path d="M12 0 L15 9 L24 12 L15 15 L12 24 L9 15 L0 12 L9 9 Z" />
              </g>

              {/* Small stars */}
              <g>
                <path d="M180 130 L182 135 L187 137 L182 139 L180 144 L178 139 L173 137 L178 135 Z" />
                <path d="M260 170 L262 174 L266 176 L262 178 L260 182 L258 178 L254 176 L258 174 Z" />
                <path d="M40 230 L42 234 L46 236 L42 238 L40 242 L38 238 L34 236 L38 234 Z" />
                <path d="M150 260 L152 264 L156 266 L152 268 L150 272 L148 268 L144 266 L148 264 Z" />
              </g>

              {/* UFO */}
              <g transform="translate(225, 200)">
                <ellipse cx="20" cy="14" rx="20" ry="5" />
                <path d="M8 14 Q12 4 20 4 Q28 4 32 14" />
                <circle cx="16" cy="9" r="1" fill="currentColor" />
                <circle cx="24" cy="9" r="1" fill="currentColor" />
                <path d="M10 18 L6 26 M20 19 L20 28 M30 18 L34 26" strokeDasharray="2 3" />
              </g>

              {/* Comet */}
              <g transform="translate(20, 90)">
                <circle cx="6" cy="6" r="3" />
                <path d="M9 9 L22 22 M6 12 L18 24 M12 6 L24 18" />
              </g>

              {/* Planet (Earth-like) */}
              <g transform="translate(135, 200)">
                <circle cx="14" cy="14" r="14" />
                <path d="M2 12 Q8 8 14 14 Q20 20 26 16 M4 20 Q10 16 16 22" />
              </g>

              {/* Satellite */}
              <g transform="translate(255, 90)">
                <rect x="10" y="10" width="10" height="8" />
                <path d="M0 14 L10 14 M20 14 L30 14" />
                <path d="M0 10 L4 14 L0 18 Z M30 10 L26 14 L30 18 Z" />
                <path d="M15 18 L15 26 L18 28" />
              </g>

              {/* Atom */}
              <g transform="translate(50, 250)" strokeWidth="0.9">
                <circle cx="14" cy="14" r="2" fill="currentColor" />
                <ellipse cx="14" cy="14" rx="13" ry="5" />
                <ellipse cx="14" cy="14" rx="13" ry="5" transform="rotate(60 14 14)" />
                <ellipse cx="14" cy="14" rx="13" ry="5" transform="rotate(-60 14 14)" />
              </g>

              {/* Constellation */}
              <g transform="translate(190, 270)">
                <circle cx="0" cy="0" r="1.4" fill="currentColor" />
                <circle cx="14" cy="6" r="1.4" fill="currentColor" />
                <circle cx="26" cy="2" r="1.4" fill="currentColor" />
                <circle cx="36" cy="14" r="1.4" fill="currentColor" />
                <circle cx="22" cy="20" r="1.4" fill="currentColor" />
                <path d="M0 0 L14 6 L26 2 L36 14 L22 20 L14 6" strokeWidth="0.6" />
              </g>

              {/* Tiny dots (stardust) */}
              <g fill="currentColor" stroke="none">
                <circle cx="100" cy="20" r="1" />
                <circle cx="280" cy="120" r="1" />
                <circle cx="200" cy="160" r="1" />
                <circle cx="90" cy="200" r="1" />
                <circle cx="300" cy="240" r="1" />
                <circle cx="10" cy="180" r="1" />
                <circle cx="170" cy="40" r="1" />
                <circle cx="240" cy="280" r="1" />
                <circle cx="110" cy="290" r="1" />
              </g>
            </g>
          </pattern>
        </defs>

        <rect width="100%" height="100%" fill="url(#chat-pattern)" />
      </motion.svg>
    </div>
  );
});
