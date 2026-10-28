export interface GoogleMarkProps {
  isRedirecting?: boolean;
}

/**
 * Official Google "G" mark at 18px drawn as inline SVG in its four brand colors
 * inside a 24px cream-100 circle on the left of the label.
 * When redirecting, replaced by a 16px spinner (270-degree arc in --on-orange
 * rotating once per 800ms, linear).
 */
export function GoogleMark({ isRedirecting = false }: GoogleMarkProps) {
  if (isRedirecting) {
    return (
      <span
        aria-hidden="true"
        className="inline-flex items-center justify-center shrink-0"
        style={{ width: 24, height: 24 }}
      >
        <svg
          width={16}
          height={16}
          viewBox="0 0 16 16"
          fill="none"
          className="kimo-spinner"
        >
          <path
            d="M8 1.5A6.5 6.5 0 1 1 1.5 8"
            stroke="var(--on-orange)"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className="inline-flex items-center justify-center shrink-0"
      style={{
        width: 24,
        height: 24,
        borderRadius: 'var(--r-pill)',
        backgroundColor: 'var(--cream-100)',
      }}
    >
      <svg width={18} height={18} viewBox="0 0 18 18" fill="none">
        <path
          d="M16.92 9.1875C16.92 8.6025 16.8675 8.04 16.77 7.5H9V10.695H13.44C13.245 11.73 12.66 12.6075 11.7825 13.1925V15.27H14.46C16.0275 13.83 16.92 11.7075 16.92 9.1875Z"
          fill="#4285F4"
        />
        <path
          d="M9 17.25C11.2275 17.25 13.095 16.515 14.46 15.27L11.7825 13.1925C11.0475 13.6875 10.11 13.9875 9 13.9875C6.855 13.9875 5.0325 12.54 4.38 10.59H1.62V12.735C2.9775 15.4275 5.7675 17.25 9 17.25Z"
          fill="#34A853"
        />
        <path
          d="M4.38 10.59C4.215 10.095 4.1175 9.555 4.1175 9C4.1175 8.445 4.215 7.905 4.38 7.41V5.265H1.62C1.0575 6.39 0.75 7.6575 0.75 9C0.75 10.3425 1.0575 11.61 1.62 12.735L4.38 10.59Z"
          fill="#FBBC05"
        />
        <path
          d="M9 4.0125C10.215 4.0125 11.295 4.4325 12.15 5.25L14.52 2.88C13.0875 1.545 11.22 0.75 9 0.75C5.7675 0.75 2.9775 2.5725 1.62 5.265L4.38 7.41C5.0325 5.46 6.855 4.0125 9 4.0125Z"
          fill="#EA4335"
        />
      </svg>
    </span>
  );
}
