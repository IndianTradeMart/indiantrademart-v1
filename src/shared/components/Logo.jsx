import { Link } from 'react-router-dom';

const Logo = ({
  className = 'h-10',
  showTagline = true,
  variant = 'dark', // 'dark' for light bg, 'light' for dark bg
  to = '/',
  compact, // optional: true/false; if not passed, auto based on height class
}) => {
  // auto-compact when small heights are used (h-6/h-7/h-8)
  const autoCompact = /\bh-(6|7|8)\b/.test(className);
  const isCompact = typeof compact === 'boolean' ? compact : autoCompact;

  const gold = variant === 'light' ? 'text-white' : 'text-[#8B6F47]';
  const green = variant === 'light' ? 'text-green-300' : 'text-[#059669]';
  const taglineColor = variant === 'light' ? 'text-gray-300' : 'text-gray-500';

  const titleSize = isCompact
    ? 'text-sm sm:text-base'
    : 'text-base sm:text-lg md:text-xl';

  return (
    <Link
      to={to}
      aria-label="Indian Trade Mart"
      title="IndianTradeMart"
      className={`inline-flex items-center gap-2 ${className}`}
    >
      {/* Logo image always follows wrapper height */}
      <div className="h-full flex-shrink-0">
        <img
          src="/itm-logo.png"
          alt="IndianTradeMART Logo"
          className="h-full w-auto object-contain"
          loading="lazy"
        />
      </div>

      {/* Text */}
      <div className="min-w-0 flex flex-col leading-none">
        <div
          className={`font-semibold tracking-tight whitespace-nowrap ${titleSize}`}
        >
          <span className={gold}>Indian</span>
          <span className={gold}>Trade</span>
          <span className={green}>Mart</span>
        </div>

        {/* Tagline hidden in compact mode (sidebar/header small height) */}
        {showTagline && !isCompact && (
          <span
            className={`mt-1 text-[10px] sm:text-[11px] uppercase tracking-widest font-medium whitespace-nowrap ${taglineColor}`}
          >
            Connect &amp; Grow
          </span>
        )}
      </div>
    </Link>
  );
};

export default Logo;
