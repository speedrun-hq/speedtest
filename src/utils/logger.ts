import chalk from "chalk";

// Available colors for different transfers
const COLORS = [
  "cyan",
  "green",
  "yellow",
  "magenta",
  "white",
  "red",
  "gray",
] as const;

type Color = (typeof COLORS)[number];

export class TransferLogger {
  private color: Color;
  private prefix: string;

  constructor(index: number) {
    this.color = COLORS[index % COLORS.length];
    this.prefix = `[Transfer ${index + 1}]`;
  }

  private format(message: string): string {
    return chalk[this.color](`${this.prefix} ${message}`);
  }

  info(message: string): void {
    console.log(this.format(message));
  }

  error(message: string): void {
    console.error(this.format(message));
  }

  success(message: string): void {
    console.log(this.format(message));
  }

  warning(message: string): void {
    console.log(this.format(message));
  }
}
