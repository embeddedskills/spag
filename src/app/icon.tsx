import { ImageResponse } from 'next/og';

// Favicon metadata
export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          background: 'black',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Your Nexus SVG code here */}
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#3b82f6"
          strokeWidth="2"
        >
          <path d="M12 2L2 7l10 5 10-5-10-5z" fill="rgba(59, 130, 246, 0.2)" />
          <path d="M2 17l10 5 10-5" />
          <circle cx="12" cy="12" r="2" fill="#22c55e" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
