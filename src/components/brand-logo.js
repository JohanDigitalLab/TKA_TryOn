import Image from "next/image";

export default function BrandLogo({ className = "h-11 w-12", priority = false }) {
  return (
    <Image
      src="/tka-tryon-eagle.svg"
      alt="Logo TKA TryOn: rajawali mencengkeram huruf TKA"
      width={640}
      height={520}
      priority={priority}
      className={`${className} object-contain`}
    />
  );
}
