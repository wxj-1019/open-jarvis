/**
 * VAD AudioWorklet 处理器
 * 计算麦克风输入的 RMS 能量值，通过 postMessage 发送到主线程
 */
export const VAD_WORKLET_CODE = `
class VADProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input && input.length > 0) {
      const channel = input[0];
      let sum = 0;
      for (let i = 0; i < channel.length; i++) {
        sum += channel[i] * channel[i];
      }
      const rms = Math.sqrt(sum / channel.length);
      this.port.postMessage({ type: 'energy', rms });
    }
    return true; // keep alive
  }
}

registerProcessor('vad-processor', VADProcessor);
`;

export interface VADWorkletOptions {
  onEnergy: (rms: number) => void;
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
}

/**
 * 创建并启动 VAD AudioWorklet
 * @param stream MediaStream from getUserMedia
 * @param options callbacks
 * @returns cleanup function
 */
export async function createVADWorklet(
  stream: MediaStream,
  options: VADWorkletOptions
): Promise<() => void> {
  const audioContext = new AudioContext({ sampleRate: 16000 });

  // Create blob URL for AudioWorklet
  const blob = new Blob([VAD_WORKLET_CODE], { type: 'application/javascript' });
  const workletUrl = URL.createObjectURL(blob);
  await audioContext.audioWorklet.addModule(workletUrl);
  URL.revokeObjectURL(workletUrl);

  const source = audioContext.createMediaStreamSource(stream);
  const workletNode = new AudioWorkletNode(audioContext, 'vad-processor');

  workletNode.port.onmessage = (event) => {
    if (event.data.type === 'energy') {
      options.onEnergy(event.data.rms);
    }
  };

  source.connect(workletNode);
  workletNode.connect(audioContext.destination);

  return () => {
    workletNode.disconnect();
    source.disconnect();
    audioContext.close();
  };
}
