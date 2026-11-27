import Image from "next/image";
import logo from "../../public/logo-tka-tryon.png";

export default function BrandLogo({ className = "h-[90px] w-[90px]", priority = false }) {
  return (
    <Image
      src={logo}
      alt="Logo TKA TryOn: rajawali biru-emas mencengkeram huruf TKA tiga dimensi"
      sizes="90px"
      preload={priority}
      className={`${className} shrink-0 object-contain`}
    />
  );
}
