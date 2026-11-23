pluginManagement {
    repositories { google(); maven("https://maven-central.storage-download.googleapis.com/maven2/") // Google mirror of Maven Central (avoids 429s on shared IPs)
        mavenCentral(); gradlePluginPortal() }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories { google(); maven("https://maven-central.storage-download.googleapis.com/maven2/") // Google mirror of Maven Central (avoids 429s on shared IPs)
        mavenCentral() }
}
rootProject.name = "SalonMind"
include(":app")
