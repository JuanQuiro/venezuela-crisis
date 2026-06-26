@rem
@rem Gradle start up script
@rem
@if "%DEBUG%"=="" @echo off
@rem Set local scope for the variables
set DIRNAME=%~dp0
if "%DIRNAME%"=="" set DIRNAME=.
@rem Add default JVM options here.
set CLASSPATH=%DIRNAME%\gradle\wrapper\gradle-wrapper.jar
@rem Execute Gradle
"%JAVA_HOME%\bin\java.exe" %DEFAULT_JVM_OPTS% %JAVA_OPTS% %GRADLE_OPTS% "-Dorg.gradle.appname=%APP_BASE%" -classpath "%CLASSPATH%" org.gradle.wrapper.GradleWrapperMain %*
