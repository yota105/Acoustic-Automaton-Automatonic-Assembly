// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(target_os = "windows")]
    set_high_performance_gpu_preference();

    electronics_temp_lib::run()
}

#[cfg(target_os = "windows")]
fn set_high_performance_gpu_preference() {
    use std::mem::transmute;

    use windows::core::{w, PCSTR};
    use windows::Win32::Foundation::BOOL;
    use windows::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryW};

    #[repr(i32)]
    #[derive(Copy, Clone)]
    enum GpuPreference {
        HighPerformance = 2,
    }

    type SetProcessDefaultGpuPreferenceFn = unsafe extern "system" fn(GpuPreference) -> BOOL;

    unsafe {
        const PROC_NAME: &[u8] = b"SetProcessDefaultGpuPreference\0";

        let Ok(module) = LoadLibraryW(w!("gdi32.dll")) else {
            eprintln!("[GPU] gdi32.dll not available; skipping GPU preference hint.");
            return;
        };

        let Some(symbol) = GetProcAddress(module, PCSTR(PROC_NAME.as_ptr())) else {
            eprintln!("[GPU] SetProcessDefaultGpuPreference not exported; skipping hint.");
            return;
        };

        let func: SetProcessDefaultGpuPreferenceFn = transmute(symbol);
        if !func(GpuPreference::HighPerformance).as_bool() {
            eprintln!("[GPU] Failed to hint high-performance GPU preference (continuing anyway).");
        }
    }
}
