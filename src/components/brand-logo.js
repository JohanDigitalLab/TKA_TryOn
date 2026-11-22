"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import logo01 from "../../public/logo-tka-01.png";
import logo02 from "../../public/logo-tka-02.png";
import logo03 from "../../public/logo-tka-03.png";
import logo04 from "../../public/logo-tka-04.png";
import logo05 from "../../public/logo-tka-05.png";
import logo06 from "../../public/logo-tka-06.png";

const logos = [logo01, logo02, logo03, logo04, logo05, logo06];

export default function BrandLogo({ className = "h-[90px] w-[90px]", priority = false }) {
  const [logoIndex, setLogoIndex] = useState(0);

  useEffect(() => {
    Promise.resolve().then(() => {
      setLogoIndex(Math.floor(Math.random() * logos.length));
    });
  }, []);

  return (
    <Image
      src={logos[logoIndex]}
      alt="Logo TKA TryOut"
      width={90}
      height={90}
      sizes="90px"
      priority={priority}
      className={`${className} shrink-0 object-contain`}
    />
  );
}
