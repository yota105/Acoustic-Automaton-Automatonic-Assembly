// 利用可能なデバイス一覧を表示するデバッグスクリプト
// ブラウザのコンソールで実行してください

console.log('=== Available Audio Input Devices ===');

navigator.mediaDevices.enumerateDevices()
  .then(devices => {
    const audioInputs = devices.filter(device => device.kind === 'audioinput');
    
    console.log(`Found ${audioInputs.length} audio input devices:`);
    
    audioInputs.forEach((device, index) => {
      console.log(`[${index}] Device ID: "${device.deviceId}"`);
      console.log(`    Label: "${device.label}"`);
      console.log(`    Group ID: "${device.groupId}"`);
      console.log('---');
    });
    
    // 特定のデバイスを見つける（HD Pro Webcam C920）
    const targetDevice = audioInputs.find(device => 
      device.label.includes('HD Pro Webcam C920') || 
      device.label.includes('C920') ||
      device.label.includes('Webcam')
    );
    
    if (targetDevice) {
      console.log('🎯 Target device found:');
      console.log(`Device ID: "${targetDevice.deviceId}"`);
      console.log(`Label: "${targetDevice.label}"`);
      console.log('\n📋 Copy this deviceId to ioConfig.ts:');
      console.log(`deviceId: "${targetDevice.deviceId}"`);
    } else {
      console.log('⚠️ Target device (HD Pro Webcam C920) not found');
      console.log('Available devices:', audioInputs.map(d => d.label));
    }
  })
  .catch(error => {
    console.error('Error enumerating devices:', error);
  });
