import DarkCircleSvg from "../../../../public/landing/darkcircle.svg";
import Image from "next/image";

interface DarkCircleProps {
    percent: number;
    text: string;
    unit: string
}

const DarkCircle = ({ percent, text, unit }: DarkCircleProps) => {
    return (
        <div className="relative w-[190px] h-[190px] md:w-[226px] md:h-[226px] flex items-center justify-center">
            <Image
                src={DarkCircleSvg}
                alt="dark circle"
                fill
                className="object-contain"
            />

            {/* Overlay text */}
            <div className="absolute text-white text-center">
                <p>
                    <span className="text-4xl md:text-6xl font-medium font-dela">{percent}</span>
                    <span className="text-md md:text-xl font-medium font-dela pl-2">{unit}</span></p>
                <p className="text-xl font-inter">{text}</p>
            </div>
        </div>
    );
};

export default DarkCircle;
