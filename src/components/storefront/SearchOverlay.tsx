import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { storefrontQueries } from "@/lib/data/storefront";
import { useStorefront, formatPrice, pickName } from "@/lib/storefront-context";
import { Button } from "@/components/ui/button";
import { cloudflareImageUrl } from "@/lib/media-delivery";
import { Search, X, Sparkles, Clock, ArrowRight, ArrowLeft, ShoppingBag } from "lucide-react";

/** How many products the overlay lists while typing. */
const OVERLAY_RESULT_LIMIT = 10;

interface SearchOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

const RECENT_SEARCHES_KEY_PREFIX = "boutq_recent_searches_";

export function SearchOverlay({ isOpen, onClose }: SearchOverlayProps) {
  const { brand, settings, lang, t } = useStorefront();
  const navigate = useNavigate();
  const isAr = lang === "ar";
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  const storageKey = `${RECENT_SEARCHES_KEY_PREFIX}${brand.id}`;

  // Load recent searches on mount / open
  useEffect(() => {
    if (isOpen) {
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            setRecentSearches(parsed.slice(0, 6));
          }
        }
      } catch {
        // storage disabled or corrupted
      }
    }
  }, [isOpen, storageKey]);

  // Save recent search
  const saveRecentSearch = (term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;
    try {
      const updated = [
        trimmed,
        ...recentSearches.filter((s) => s.toLowerCase() !== trimmed.toLowerCase()),
      ].slice(0, 6);
      setRecentSearches(updated);
      localStorage.setItem(storageKey, JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

  const clearRecentSearches = () => {
    try {
      localStorage.removeItem(storageKey);
      setRecentSearches([]);
    } catch {
      // ignore
    }
  };

  // Debounce query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(query.trim());
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  // Handle ESC key and body scroll lock
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Auto focus with slight delay for mobile keyboard
    const focusTimeout = setTimeout(() => {
      inputRef.current?.focus();
    }, 50);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
      clearTimeout(focusTimeout);
    };
  }, [isOpen, onClose]);

  // Reset state on close
  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setDebounced("");
    }
  }, [isOpen]);

  // Top-level categories for the empty state, from the shared categories cache.
  const { data: categories = [] } = useQuery({
    ...storefrontQueries.categories(brand),
    enabled: isOpen,
  });
  const topCategories = useMemo(
    () => categories.filter((category) => !category.parent_id).slice(0, 8),
    [categories],
  );

  // Live product search
  const { data: results = [], isFetching } = useQuery({
    ...storefrontQueries.quickSearch(brand, debounced, OVERLAY_RESULT_LIMIT),
    enabled: isOpen && debounced.length >= 2,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    saveRecentSearch(q);
    onClose();
    navigate({
      to: "/$slug/search",
      params: { slug: brand.slug },
      search: { q },
    });
  };

  const handleSelectRecent = (term: string) => {
    setQuery(term);
    saveRecentSearch(term);
    onClose();
    navigate({
      to: "/$slug/search",
      params: { slug: brand.slug },
      search: { q: term },
    });
  };

  if (!isOpen) return null;

  const BackIcon = isAr ? ArrowRight : ArrowLeft;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("البحث في المتجر", "Store Search")}
      dir={isAr ? "rtl" : "ltr"}
      className="fixed inset-0 z-50 flex flex-col bg-background/98 backdrop-blur-xl animate-in fade-in duration-200"
    >
      {/* 1. Header Search Bar */}
      <div className="flex h-16 items-center gap-2 border-b border-border px-4 sm:px-6">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="h-11 w-11 shrink-0 rounded-full text-foreground hover:bg-muted"
          aria-label={t("رجوع", "Back")}
        >
          <BackIcon className="h-5 w-5" />
        </Button>

        <form onSubmit={handleSubmit} className="flex-1 relative flex items-center min-w-0">
          <Search className="pointer-events-none absolute start-3 h-4 w-4 text-muted-foreground" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t(
              "ابحث عن أي قطعة، قماش، أو لون...",
              "Search products, fabrics, colors...",
            )}
            className="h-11 w-full rounded-full border border-border bg-muted/50 ps-9 pe-9 text-sm font-medium text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          {query && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              className="absolute end-1.5 h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
              aria-label={t("مسح", "Clear")}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </form>

        <Button
          type="button"
          variant="ghost"
          onClick={onClose}
          className="h-11 px-3 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          {t("إلغاء", "Cancel")}
        </Button>
      </div>

      {/* 2. Content Area */}
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 max-w-3xl mx-auto w-full space-y-6">
        {/* Case A: Query too short -> Show Recent Searches & Discover Categories */}
        {debounced.length < 2 && (
          <div className="space-y-6">
            {/* Recent Searches */}
            {recentSearches.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    {t("عمليات البحث الأخيرة", "Recent Searches")}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={clearRecentSearches}
                    className="h-auto rounded-md hover:text-foreground underline transition-colors"
                  >
                    {t("مسح الكل", "Clear All")}
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {recentSearches.map((term, idx) => (
                    <Button
                      key={idx}
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSelectRecent(term)}
                      className="h-auto rounded-md inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted active:scale-95 transition-all"
                    >
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      <span>{term}</span>
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Discover Categories */}
            {topCategories.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  <span>{t("اكتشف الأقسام", "Explore Categories")}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {topCategories.map((cat: any) => {
                    const catName = isAr ? cat.name_ar || cat.name_en : cat.name_en || cat.name_ar;
                    return (
                      <Link
                        key={cat.id}
                        to="/$slug/$category"
                        params={{ slug: brand.slug, category: cat.slug }}
                        onClick={onClose}
                        className="rounded-full border border-border bg-muted/60 px-4 py-2 text-xs font-medium text-foreground hover:bg-primary/10 hover:border-primary/30 hover:text-primary transition-all"
                      >
                        {catName}
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Case B: Loading State */}
        {debounced.length >= 2 && isFetching && (
          <div className="space-y-3 py-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3 animate-pulse p-2 rounded-xl">
                <div className="h-14 w-14 rounded-lg bg-muted shrink-0" />
                <div className="flex-1 space-y-2 min-w-0">
                  <div className="h-4 bg-muted rounded w-2/3" />
                  <div className="h-3 bg-muted rounded w-1/4" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Case C: No results */}
        {debounced.length >= 2 && !isFetching && results.length === 0 && (
          <div className="py-16 text-center space-y-2">
            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
              <ShoppingBag className="h-6 w-6" />
            </div>
            <p className="text-base font-semibold text-foreground">
              {t("لا توجد نتائج مطابقة", "No products found")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t(
                "جرب البحث بكلمات أخرى أو تصفح الأقسام الرئيسية.",
                "Try searching with different keywords or browse our categories.",
              )}
            </p>
          </div>
        )}

        {/* Case D: Live Results */}
        {debounced.length >= 2 && !isFetching && results.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground px-1">
              {t(`${results.length} نتائج مطابقة`, `${results.length} matching products`)}
            </p>
            <ul className="divide-y divide-border/60">
              {results.map((product: any) => {
                const displayName = pickName(lang, product);
                const price = Number(product.product_variants?.[0]?.selling_price ?? 0);
                const oldPrice = Number(product.product_variants?.[0]?.original_price ?? 0);
                const imageUrl =
                  product.image_url ||
                  product.media?.find((item: any) => item.type === "image")?.url ||
                  null;
                const hasDiscount = oldPrice > price;

                return (
                  <li key={product.id}>
                    <Link
                      to="/$slug/product/$id"
                      params={{ slug: brand.slug, id: product.id }}
                      onClick={() => {
                        saveRecentSearch(query);
                        onClose();
                      }}
                      className="flex items-center gap-3.5 p-2 rounded-xl hover:bg-muted/50 active:bg-muted transition-colors group"
                    >
                      <div className="h-14 w-14 shrink-0 rounded-lg bg-muted border border-border overflow-hidden relative">
                        {imageUrl ? (
                          <img
                            src={cloudflareImageUrl(imageUrl, 160)}
                            alt=""
                            width={56}
                            height={56}
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                            <ShoppingBag className="h-5 w-5 opacity-40" />
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                          {displayName}
                        </h4>
                        {product.category && (
                          <p className="text-xs text-muted-foreground truncate">
                            {product.category}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs font-bold text-primary">
                            {formatPrice(price, settings.currency)}
                          </span>
                          {hasDiscount && (
                            <span className="text-xs text-muted-foreground line-through">
                              {formatPrice(oldPrice, settings.currency)}
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>

            {/* View all results button */}
            <div className="pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleSubmit}
                className="w-full h-11 text-xs font-semibold"
              >
                {t(`عرض جميع النتائج لـ "${query}"`, `View all results for "${query}"`)}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
