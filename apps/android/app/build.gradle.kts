import groovy.json.JsonSlurper
import java.util.Properties

// One source of truth for the app URL and version numbers: apps/version.json (also read by the website's update check).
@Suppress("UNCHECKED_CAST")
val shared = JsonSlurper().parse(rootProject.file("../version.json")) as Map<String, Any>
val androidCfg = shared["android"] as Map<String, Any>
val siteUrl = (shared["url"] as String).trimEnd('/')
val siteHost = siteUrl.removePrefix("https://")
val code = (androidCfg["versionCode"] as Number).toInt()

plugins { id("com.android.application") }

android {
    namespace = "app.salonmind.android"
    compileSdk = 36

    defaultConfig {
        applicationId = androidCfg["applicationId"] as String
        minSdk = 24 // Android 7.0+ (androidbrowserhelper minimum)
        targetSdk = 36
        versionCode = code
        versionName = androidCfg["versionName"] as String
        manifestPlaceholders["hostName"] = siteHost
        // the shell reports its version to the site, which offers in-place updates of the shell itself
        resValue("string", "launchUrl", "$siteUrl/open?shell=android&v=$code")
        resValue("string", "siteUrl", siteUrl)
        resValue("string", "asset_statements",
            "[{\\\"relation\\\": [\\\"delegate_permission/common.handle_all_urls\\\"], \\\"target\\\": {\\\"namespace\\\": \\\"web\\\", \\\"site\\\": \\\"$siteUrl\\\"}}]")
    }

    // Release signing: the same key must sign every version, or Android refuses to update in place.
    // Locally: apps/android/keystore.properties (git-ignored). CI: secrets passed as environment variables.
    val localKs = Properties().apply {
        rootProject.file("keystore.properties").takeIf { it.exists() }?.inputStream()?.use { load(it) }
    }
    fun secret(env: String, key: String): String? = System.getenv(env) ?: localKs.getProperty(key)
    val ksFile = secret("ANDROID_KEYSTORE_FILE", "storeFile")
    signingConfigs {
        create("release") {
            if (ksFile != null) {
                storeFile = file(ksFile)
                storePassword = secret("ANDROID_KEYSTORE_PASSWORD", "storePassword")
                keyAlias = secret("ANDROID_KEY_ALIAS", "keyAlias")
                keyPassword = secret("ANDROID_KEY_PASSWORD", "keyPassword")
            }
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
            if (ksFile != null) signingConfig = signingConfigs.getByName("release")
        }
    }
    buildFeatures { resValues = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("com.google.androidbrowserhelper:androidbrowserhelper:2.7.4")
}
