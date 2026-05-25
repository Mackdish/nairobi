import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type ProductVisualProps = {
  imageUrl?: string;
  image: string;
  bg: string;
  alt: string;
  className?: string;
  imageClassName?: string;
  emojiClassName?: string;
};

export function ProductVisual({
  imageUrl,
  image,
  bg,
  alt,
  className,
  imageClassName,
  emojiClassName,
}: ProductVisualProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [imageUrl]);

  const showImage = Boolean(imageUrl) && !failed;

  return (
    <div className={cn("relative overflow-hidden", bg, className)}>
      {showImage ? (
        <img
          src={imageUrl}
          alt={alt}
          loading="lazy"
          onError={() => setFailed(true)}
          className={cn("absolute inset-0 h-full w-full object-cover", imageClassName)}
        />
      ) : (
        <div className={cn("absolute inset-0 grid place-items-center", emojiClassName)}>{image}</div>
      )}
    </div>
  );
}
